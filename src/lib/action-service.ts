import "server-only";
import crypto from "node:crypto";
import Decimal from "decimal.js";
import { sql } from "@/lib/db";
import { foldLedger } from "@/domain/ledger";
import { getStrategyEngine } from "@/domain/strategy/registry";
import { resolveMapping, type MappingCandidate } from "@/domain/instruments";

function isoDate(value: unknown) { return value instanceof Date ? value.toISOString().slice(0,10) : String(value).slice(0,10); }
function nextReview(start: Date, frequency: string) { const d=new Date(start); if(frequency==="MONTHLY")d.setUTCMonth(d.getUTCMonth()+1);else if(frequency==="ANNUAL")d.setUTCFullYear(d.getUTCFullYear()+1);else d.setUTCMonth(d.getUTCMonth()+3);return d; }

export async function calculateAction(strategyInstanceId:string){
  const rows=await sql.unsafe("SELECT i.id,i.user_id,i.strategy_version_id,i.started_at,i.onboarding_mode,i.last_reconciled_at,d.engine,v.config,a.country,a.wrapper,a.currency,a.broker_name,s.state FROM strategy_instances i JOIN strategy_definitions d ON d.id=i.strategy_definition_id JOIN strategy_versions v ON v.id=i.strategy_version_id JOIN accounts a ON a.id=i.account_id JOIN strategy_states s ON s.strategy_instance_id=i.id WHERE i.id=$1 AND i.status='ACTIVE' LIMIT 1",[strategyInstanceId]);
  const instance=rows[0];if(!instance)throw new Error("STRATEGY_INSTANCE_NOT_FOUND");
  const ledgerRows=await sql.unsafe("SELECT event_type,cash_amount,fee_amount,instrument_id,quantity,occurred_at,created_at FROM ledger_events WHERE strategy_instance_id=$1 ORDER BY occurred_at,created_at",[strategyInstanceId]);
  const folded=foldLedger(ledgerRows.map((r)=>({eventType:String(r.event_type),cashAmount:String(r.cash_amount),feeAmount:String(r.fee_amount),instrumentId:r.instrument_id?String(r.instrument_id):null,quantity:String(r.quantity)})));
  const config=(instance.config??{}) as Record<string,unknown>;
  const state={...((instance.state??{}) as Record<string,unknown>)};
  const targetOverride=await sql.unsafe("SELECT manual_value FROM overrides WHERE strategy_instance_id=$1 AND field_key='strategy_state.targetValue' AND active=true ORDER BY created_at DESC LIMIT 1",[strategyInstanceId]);
  if(targetOverride[0]?.manual_value!=null) state.targetValue=String(targetOverride[0].manual_value);

  const exposurePositions:Array<{economicExposure:string;value:Decimal;tradingLineId?:string}>=[];
  let dataStatus:"CURRENT"|"STALE"|"MISSING"=state.resumeNeedsReconciliation||state.unresolvedReconciliation?"MISSING":"CURRENT";
  let dataMessage=state.resumeNeedsReconciliation?"Quick resume needs an opening holdings snapshot before a high-confidence action can be calculated.":state.unresolvedReconciliation?"An unresolved broker discrepancy must be classified before financial actions resume.":undefined;

  for(const [instrumentId,quantity] of folded.quantities.entries()){
    if(quantity.eq(0))continue;
    const market=await sql.unsafe("SELECT i.economic_exposure,o.price,o.observed_at,o.currency AS observation_currency,tl.currency AS trading_currency,tl.id AS trading_line_id FROM instruments i LEFT JOIN trading_lines tl ON tl.instrument_id=i.id AND tl.effective_from<=current_date AND (tl.effective_to IS NULL OR tl.effective_to>=current_date) LEFT JOIN LATERAL (SELECT price,observed_at,currency FROM market_data_observations m WHERE m.trading_line_id=tl.id ORDER BY observed_at DESC LIMIT 1) o ON true WHERE i.id=$1 LIMIT 1",[instrumentId]);
    const m=market[0];
    const priceOverride=await sql.unsafe("SELECT manual_value FROM overrides WHERE strategy_instance_id=$1 AND field_key=$2 AND active=true ORDER BY created_at DESC LIMIT 1",[strategyInstanceId,"market_price:"+instrumentId]);
    const priceCurrency=String(m?.observation_currency??m?.trading_currency??"");
    if(priceCurrency&&priceCurrency!==String(instance.currency)){
      dataStatus="MISSING";
      dataMessage="FX conversion is required for a held instrument; actions are suppressed until an explicit FX source is configured.";
      continue;
    }
    const manualPrice=priceOverride[0]?.manual_value==null?null:new Decimal(String(priceOverride[0].manual_value));
    if(manualPrice){
      exposurePositions.push({economicExposure:String(m?.economic_exposure??""),value:quantity.mul(manualPrice),tradingLineId:m?.trading_line_id?String(m.trading_line_id):undefined});
      continue;
    }
    if(!m?.price){dataStatus="MISSING";dataMessage="A held instrument has no current market price.";continue;}
    const observedAt=new Date(m.observed_at);
    if((Date.now()-observedAt.getTime())/3600000>36&&dataStatus!=="MISSING"){dataStatus="STALE";dataMessage="Market data is stale; financial actions are suppressed until data is current or confirmed.";}
    exposurePositions.push({economicExposure:String(m.economic_exposure),value:quantity.mul(new Decimal(String(m.price))),tradingLineId:m.trading_line_id?String(m.trading_line_id):undefined});
  }

  const frequency=String(config.reviewFrequency??"QUARTERLY");
  const lastReview=state.lastReviewAt?new Date(String(state.lastReviewAt)):new Date(instance.started_at);
  const dueAt=nextReview(lastReview,frequency);
  const reviewDue=Boolean(state.forceReview)||new Date()>=dueAt;
  const contributionRows=await sql.unsafe("SELECT COALESCE(sum(cash_amount),0) AS amount FROM ledger_events WHERE strategy_instance_id=$1 AND event_type='CONTRIBUTION' AND occurred_at>$2",[strategyInstanceId,lastReview]);
  const contributionsSinceReview=new Decimal(String(contributionRows[0]?.amount??0));
  const engine=getStrategyEngine(String(instance.engine));
  let proposal=engine.calculate({strategyInstanceId,strategyVersionId:String(instance.strategy_version_id),now:new Date(),baseCurrency:String(instance.currency),cash:folded.cash,exposures:exposurePositions,contributionsSinceReview,state,config,reviewDue,nextReviewAt:dueAt,dataHealth:{status:dataStatus,message:dataMessage}});

  let tradingLineId:string|null=null;
  if(proposal.economicExposure&&["BUY","SELL","REBALANCE"].includes(proposal.actionType)){
    const mappingRows=await sql.unsafe("SELECT m.id,m.economic_exposure,m.leverage,m.direction,m.country,m.wrapper,m.broker,m.preferred_currency,m.fidelity,m.effective_from,m.effective_to,m.trading_line_id FROM regional_instrument_mappings m WHERE m.economic_exposure=$1 AND m.country=$2 AND m.wrapper=$3 AND m.enabled=true",[proposal.economicExposure,instance.country,instance.wrapper]);
    const candidates:MappingCandidate[]=mappingRows.map((r)=>({id:String(r.id),economicExposure:String(r.economic_exposure),leverage:String(r.leverage),direction:String(r.direction),country:String(r.country),wrapper:String(r.wrapper),broker:r.broker?String(r.broker):null,preferredCurrency:r.preferred_currency?String(r.preferred_currency):null,fidelity:String(r.fidelity),effectiveFrom:isoDate(r.effective_from),effectiveTo:r.effective_to?isoDate(r.effective_to):null,tradingLineId:String(r.trading_line_id)}));
    const leverage=proposal.economicExposure.includes("3X")?"3.000000":"1.000000";
    const mapping=resolveMapping(candidates,{economicExposure:proposal.economicExposure,leverage,direction:"LONG",country:String(instance.country),wrapper:String(instance.wrapper),broker:instance.broker_name?String(instance.broker_name):null,preferredCurrency:String(instance.currency),asOf:new Date().toISOString().slice(0,10)});
    if(!mapping) proposal={actionType:"DATA_REQUIRED",title:"This implementation is not supported yet",instruction:"No sufficiently faithful regional instrument mapping is configured for this account type.",explanation:[...proposal.explanation,{label:"Required exposure",value:proposal.economicExposure}],nextState:state,confidence:"LOW",dueAt:proposal.dueAt};
    else tradingLineId=mapping.tradingLineId;
  }

  const stablePositions=exposurePositions.map((p)=>p.economicExposure+":"+p.value.toString()+":"+(p.tradingLineId??"")).sort().join(",");
  const material=[
    strategyInstanceId,String(instance.strategy_version_id),lastReview.toISOString(),proposal.actionType,
    proposal.amount?.toString()??"",proposal.currency??"",proposal.economicExposure??"",tradingLineId??"",
    folded.cash.toString(),contributionsSinceReview.toString(),stablePositions,dataStatus
  ].join("|");
  const fingerprint=crypto.createHash("sha256").update(material).digest("hex");
  const nextState=["BUY","SELL","REBALANCE","HOLD"].includes(proposal.actionType)?{...proposal.nextState,lastReviewAt:new Date().toISOString(),forceReview:false}:proposal.nextState;
  const totalValue=exposurePositions.reduce((sum,p)=>sum.plus(p.value),folded.cash);
  if(dataStatus==="CURRENT")await sql.unsafe("INSERT INTO performance_series (strategy_instance_id,series_type,date,value,metadata) VALUES ($1,'USER_VALUE',current_date,$2,$3::jsonb) ON CONFLICT (strategy_instance_id,series_type,date) DO UPDATE SET value=EXCLUDED.value,metadata=EXCLUDED.metadata",[strategyInstanceId,totalValue.toString(),JSON.stringify({source:"ledger+market"})]);
  const inserted=await sql.unsafe("INSERT INTO actions (strategy_instance_id,strategy_version_id,fingerprint,action_type,status,title,instruction,amount,currency,trading_line_id,explanation,next_state,confidence,due_at) VALUES ($1,$2,$3,$4,'CALCULATED',$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13) ON CONFLICT (strategy_instance_id,fingerprint) DO UPDATE SET updated_at=now() RETURNING id",[strategyInstanceId,instance.strategy_version_id,fingerprint,proposal.actionType,proposal.title,proposal.instruction,proposal.amount?.toString()??null,proposal.currency??null,tradingLineId,JSON.stringify(proposal.explanation),JSON.stringify(nextState),proposal.confidence,proposal.dueAt??null]);
  const actionId=String(inserted[0].id);
  await sql.unsafe("UPDATE actions SET status='SUPERSEDED',superseded_by_action_id=$1,updated_at=now() WHERE strategy_instance_id=$2 AND id<>$1 AND status IN ('CALCULATED','NOTIFIED','ACKNOWLEDGED') AND action_type<>'NO_ACTION'",[actionId,strategyInstanceId]);
  const healthy=dataStatus==="CURRENT"&&proposal.actionType!=="DATA_REQUIRED";
  await sql.unsafe("UPDATE strategy_instances SET health_status=$1,updated_at=now() WHERE id=$2",[healthy?"HEALTHY":"NEEDS_ATTENTION",strategyInstanceId]);
  if(proposal.actionType!=="NO_ACTION")await sql.unsafe("INSERT INTO notifications (user_id,action_id,type,title,body) VALUES ($1,$2,'ACTION',$3,$4) ON CONFLICT DO NOTHING",[instance.user_id,actionId,proposal.title,proposal.instruction]);
  return {actionId,proposal,totalValue:totalValue.toString()};
}

export async function executeAction(userId:string,actionId:string,execution?:{price?:string;quantity?:string}){
  return sql.begin(async(tx)=>{
    const rows=await tx.unsafe("SELECT a.*,i.user_id,tl.instrument_id,acc.currency FROM actions a JOIN strategy_instances i ON i.id=a.strategy_instance_id LEFT JOIN trading_lines tl ON tl.id=a.trading_line_id LEFT JOIN accounts acc ON acc.id=i.account_id WHERE a.id=$1 AND i.user_id=$2 FOR UPDATE",[actionId,userId]);
    const action=rows[0];if(!action)throw new Error("ACTION_NOT_FOUND");if(!["CALCULATED","NOTIFIED","ACKNOWLEDGED"].includes(String(action.status)))throw new Error("ACTION_NOT_EXECUTABLE");
    if(["BUY","SELL"].includes(String(action.action_type))){
      if(!execution?.price||!action.instrument_id)throw new Error("EXECUTION_DETAILS_REQUIRED");
      const amount=new Decimal(String(action.amount??0));const price=new Decimal(execution.price);if(price.lte(0))throw new Error("INVALID_PRICE");
      const qty=execution.quantity?new Decimal(execution.quantity):amount.div(price);const isSell=String(action.action_type)==="SELL";
      await tx.unsafe("INSERT INTO ledger_events (strategy_instance_id,occurred_at,event_type,currency,cash_amount,instrument_id,quantity,unit_price,provenance,confidence,metadata) VALUES ($1,now(),$2,$3,$4,$5,$6,$7,'USER_ENTERED','VERIFIED',$8::jsonb)",[action.strategy_instance_id,isSell?"SELL":"BUY",action.currency,isSell?amount.toString():amount.neg().toString(),action.instrument_id,isSell?qty.neg().toString():qty.toString(),price.toString(),JSON.stringify({actionId})]);
    } else if(String(action.action_type)==="REBALANCE") {
      throw new Error("REBALANCE_TRADES_REQUIRED");
    }
    await tx.unsafe("UPDATE strategy_states SET state=$1::jsonb,calculated_at=now(),confidence=$2 WHERE strategy_instance_id=$3",[JSON.stringify(action.next_state??{}),action.confidence,action.strategy_instance_id]);
    await tx.unsafe("UPDATE actions SET status='EXECUTED',executed_at=now(),updated_at=now() WHERE id=$1",[actionId]);
    return true;
  });
}
