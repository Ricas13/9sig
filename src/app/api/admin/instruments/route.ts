import Decimal from "decimal.js";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { assertSameOrigin } from "@/lib/security";
import { sql } from "@/lib/db";

const isoDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value)=>{
  const d=new Date(value+"T00:00:00Z");
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
},"Invalid date");
const leverage=z.string().refine((value)=>{
  try{const d=new Decimal(value);return d.isFinite()&&d.gt(0)&&d.lte(20);}catch{return false;}
},"Invalid leverage");
const currency=z.string().length(3).transform((value)=>value.toUpperCase());
const direction=z.enum(["LONG","SHORT"]);
const nullableDate=isoDate.nullable().optional();

const instrument=z.object({
  kind:z.literal("instrument"),
  id:z.string().uuid().optional(),
  isin:z.string().min(6).max(32).nullable().optional(),
  providerInstrumentId:z.string().max(120).nullable().optional(),
  name:z.string().min(1).max(160),
  economicExposure:z.string().min(1).max(120),
  leverage,
  direction:direction.default("LONG"),
  fundCurrency:currency.nullable().optional()
});
const tradingLine=z.object({
  kind:z.literal("tradingLine"),
  instrumentId:z.string().uuid(),
  ticker:z.string().min(1).max(40),
  exchange:z.string().min(1).max(80),
  currency,
  exchangeTimezone:z.string().min(1).max(80),
  providerSymbol:z.string().max(120).nullable().optional(),
  effectiveFrom:isoDate,
  effectiveTo:nullableDate
});
const mapping=z.object({
  kind:z.literal("mapping"),
  economicExposure:z.string().min(1).max(120),
  leverage,
  direction:direction.default("LONG"),
  country:z.string().length(2).transform((value)=>value.toUpperCase()),
  wrapper:z.string().min(1).max(40),
  broker:z.string().max(80).nullable().optional(),
  preferredCurrency:currency.nullable().optional(),
  tradingLineId:z.string().uuid(),
  fidelity:z.literal("EXACT"),
  effectiveFrom:isoDate,
  effectiveTo:nullableDate,
  enabled:z.boolean().default(true)
});
const schema=z.discriminatedUnion("kind",[instrument,tradingLine,mapping]);

function normalizedLeverage(value:string){
  return new Decimal(value).toFixed(6);
}
function validTimezone(value:string){
  try{new Intl.DateTimeFormat("en-GB",{timeZone:value}).format(new Date());return true;}catch{return false;}
}
function assertDateOrder(from:string,to?:string|null){
  if(to&&to<from)throw new Error("INVALID_EFFECTIVE_RANGE");
}

export async function PUT(request:Request){
  try{
    assertSameOrigin(request);
    const admin=await requireAdmin();
    const p=schema.parse(await request.json());

    if(p.kind==="instrument"){
      const normalized=normalizedLeverage(p.leverage);
      if(p.id){
        const existing=await sql.unsafe(
          "SELECT i.economic_exposure,i.leverage,i.direction,"+
          " EXISTS(SELECT 1 FROM trading_lines tl WHERE tl.instrument_id=i.id) AS has_lines,"+
          " EXISTS(SELECT 1 FROM ledger_events l WHERE l.instrument_id=i.id) AS has_ledger"+
          " FROM instruments i WHERE i.id=$1 LIMIT 1",
          [p.id]
        );
        if(!existing[0])return Response.json({error:"Instrument not found."},{status:404});
        const semanticChange=
          String(existing[0].economic_exposure)!==p.economicExposure||
          !new Decimal(String(existing[0].leverage)).eq(normalized)||
          String(existing[0].direction)!==p.direction;
        if(semanticChange&&(existing[0].has_lines||existing[0].has_ledger)){
          return Response.json({error:"Economic exposure, leverage and direction are immutable once an instrument is in use. Create a new instrument instead."},{status:409});
        }
        await sql.unsafe(
          "UPDATE instruments SET isin=$1,provider_instrument_id=$2,name=$3,economic_exposure=$4,leverage=$5,direction=$6,fund_currency=$7,updated_at=now() WHERE id=$8",
          [p.isin??null,p.providerInstrumentId??null,p.name,p.economicExposure,normalized,p.direction,p.fundCurrency??null,p.id]
        );
      }else{
        await sql.unsafe(
          "INSERT INTO instruments (isin,provider_instrument_id,name,economic_exposure,leverage,direction,fund_currency) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [p.isin??null,p.providerInstrumentId??null,p.name,p.economicExposure,normalized,p.direction,p.fundCurrency??null]
        );
      }
    }else if(p.kind==="tradingLine"){
      assertDateOrder(p.effectiveFrom,p.effectiveTo);
      if(!validTimezone(p.exchangeTimezone))throw new Error("INVALID_TIMEZONE");
      const instrumentRows=await sql.unsafe("SELECT id FROM instruments WHERE id=$1 LIMIT 1",[p.instrumentId]);
      if(!instrumentRows[0])return Response.json({error:"Instrument not found."},{status:404});

      const existing=await sql.unsafe(
        "SELECT id,instrument_id FROM trading_lines WHERE exchange=$1 AND ticker=$2 AND effective_from=$3 LIMIT 1",
        [p.exchange,p.ticker,p.effectiveFrom]
      );
      if(existing[0]&&String(existing[0].instrument_id)!==p.instrumentId){
        return Response.json({error:"An existing trading line cannot be reassigned to a different instrument."},{status:409});
      }
      await sql.unsafe(
        "INSERT INTO trading_lines (instrument_id,ticker,exchange,currency,exchange_timezone,provider_symbol,effective_from,effective_to) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)"+
        " ON CONFLICT (exchange,ticker,effective_from) DO UPDATE SET currency=EXCLUDED.currency,exchange_timezone=EXCLUDED.exchange_timezone,provider_symbol=EXCLUDED.provider_symbol,effective_to=EXCLUDED.effective_to,updated_at=now()",
        [p.instrumentId,p.ticker,p.exchange,p.currency,p.exchangeTimezone,p.providerSymbol??null,p.effectiveFrom,p.effectiveTo??null]
      );
    }else{
      assertDateOrder(p.effectiveFrom,p.effectiveTo);
      const lineRows=await sql.unsafe(
        "SELECT tl.currency,tl.effective_from,tl.effective_to,i.economic_exposure,i.leverage,i.direction FROM trading_lines tl JOIN instruments i ON i.id=tl.instrument_id WHERE tl.id=$1 LIMIT 1",
        [p.tradingLineId]
      );
      const line=lineRows[0];
      if(!line)return Response.json({error:"Trading line not found."},{status:404});
      if(String(line.economic_exposure)!==p.economicExposure||
        !new Decimal(String(line.leverage)).eq(normalizedLeverage(p.leverage))||
        String(line.direction)!==p.direction){
        return Response.json({error:"The mapping must exactly match the selected instrument's economic exposure, leverage and direction."},{status:409});
      }
      if(p.preferredCurrency&&p.preferredCurrency!==String(line.currency).toUpperCase()){
        return Response.json({error:"Preferred currency must match the selected trading line currency."},{status:409});
      }
      const lineFrom=String(line.effective_from).slice(0,10);
      const lineTo=line.effective_to?String(line.effective_to).slice(0,10):null;
      if(p.effectiveFrom<lineFrom||(lineTo&&(!p.effectiveTo||p.effectiveTo>lineTo))){
        return Response.json({error:"The mapping effective period must fit inside the trading line effective period."},{status:409});
      }
      const normalizedBroker=p.broker?.trim()||null;
      const overlap=await sql.unsafe(
        "SELECT id FROM regional_instrument_mappings WHERE economic_exposure=$1 AND leverage=$2 AND direction=$3 AND country=$4 AND wrapper=$5"+
        " AND COALESCE(lower(broker),'')=COALESCE(lower($6),'') AND COALESCE(preferred_currency,'')=COALESCE($7,'')"+
        " AND daterange(effective_from,COALESCE(effective_to,'infinity'::date),'[]') && daterange($8::date,COALESCE($9::date,'infinity'::date),'[]') LIMIT 1",
        [p.economicExposure,normalizedLeverage(p.leverage),p.direction,p.country,p.wrapper,normalizedBroker,p.preferredCurrency??null,p.effectiveFrom,p.effectiveTo??null]
      );
      if(overlap[0])return Response.json({error:"An overlapping regional mapping already exists for that exposure/account/broker/currency scope."},{status:409});
      await sql.unsafe(
        "INSERT INTO regional_instrument_mappings (economic_exposure,leverage,direction,country,wrapper,broker,preferred_currency,trading_line_id,fidelity,effective_from,effective_to,enabled) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'EXACT',$9,$10,$11)",
        [p.economicExposure,normalizedLeverage(p.leverage),p.direction,p.country,p.wrapper,normalizedBroker,p.preferredCurrency??null,p.tradingLineId,p.effectiveFrom,p.effectiveTo??null,p.enabled]
      );
    }

    await sql.unsafe(
      "INSERT INTO audit_events (actor_user_id,action,entity_type,metadata) VALUES ($1,'instrument-config.upsert','instrument_config',$2::jsonb)",
      [admin.id,JSON.stringify({kind:p.kind})]
    );
    return Response.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return Response.json({error:"Invalid instrument configuration."},{status:400});
    const code=error instanceof Error?error.message:"FAILED";
    if(code==="INVALID_TIMEZONE")return Response.json({error:"Enter a valid IANA exchange timezone."},{status:400});
    if(code==="INVALID_EFFECTIVE_RANGE")return Response.json({error:"Effective-to must not be before effective-from."},{status:400});
    return Response.json({error:"Could not update instrument configuration."},{status:500});
  }
}
