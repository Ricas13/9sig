import postgres from "postgres";

async function main() {
  const url=process.env.DATABASE_URL;
  if(!url)throw new Error("DATABASE_URL is required");
  const sql=postgres(url,{max:1,prepare:false});
  try {
    async function seedPlan(slug:string,name:string,monthly:number,annual:number,max:number|null,entitlements:object,sort:number){
      const query="INSERT INTO plans (slug,display_name,description,monthly_price_minor,annual_price_minor,billing_currency,max_active_strategies,entitlements,sort_order) VALUES ($1,$2,$3,$4,$5,'GBP',$6,$7::jsonb,$8) ON CONFLICT (slug) DO UPDATE SET display_name=EXCLUDED.display_name,monthly_price_minor=EXCLUDED.monthly_price_minor,annual_price_minor=EXCLUDED.annual_price_minor,max_active_strategies=EXCLUDED.max_active_strategies,entitlements=EXCLUDED.entitlements,sort_order=EXCLUDED.sort_order,updated_at=now()";
      await sql.unsafe(query,[slug,name,name+" plan",monthly,annual,max,JSON.stringify(entitlements),sort]);
    }
    await seedPlan("free","Free",0,0,1,{features:["history","reconciliation","resume","community"],notificationChannels:[]},0);
    await seedPlan("investor","Investor",999,9900,3,{features:["history","reconciliation","resume","community","analytics","comparisons"],notificationChannels:["EMAIL","DISCORD"]},10);
    await seedPlan("pro","Pro",2999,29900,null,{features:["history","reconciliation","resume","community","analytics","comparisons","advanced_imports","custom_strategies"],notificationChannels:["EMAIL","DISCORD"]},20);

    const definitions=[
      ["9sig","9Sig","SIGNAL_VALUE_TARGET","Rules-based value target strategy","VALUE_TARGET",true,true],
      ["hfea","HFEA","FIXED_ALLOCATION","Leveraged fixed-allocation strategy","FIXED_ALLOCATION",false,false],
      ["golden-butterfly","Golden Butterfly","FIXED_ALLOCATION","Diversified fixed-allocation strategy","FIXED_ALLOCATION",false,false],
      ["dual-momentum","Dual Momentum","MOMENTUM","Momentum rotation strategy","MOMENTUM",false,false]
    ] as const;

    for(const item of definitions){
      const key=item[0],name=item[1],family=item[2],description=item[3],engine=item[4],proprietary=item[5],enabled=item[6];
      const defQuery="INSERT INTO strategy_definitions (key,name,family,description,engine,proprietary,enabled,supported_regions,supported_wrappers) VALUES ($1,$2,$3,$4,$5,$6,$7,'[\"GB\",\"US\",\"EU\"]'::jsonb,'[\"ISA\",\"SIPP\",\"TAXABLE\"]'::jsonb) ON CONFLICT (key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,engine=EXCLUDED.engine,proprietary=EXCLUDED.proprietary,enabled=EXCLUDED.enabled,updated_at=now() RETURNING id";
      const rows=await sql.unsafe(defQuery,[key,name,family,description,engine,proprietary,enabled]);
      const id=rows[0].id;
      let config:object={};
      if(key==="9sig")config={targetExposure:"NASDAQ_100_3X_LONG",initialTargetRatio:"0.60",targetRate:"0.09",contributionTargetRatio:"0.50",maxCashUse:"0.90",tolerance:"0.01",reviewFrequency:"QUARTERLY"};
      if(key==="hfea")config={allocations:[{exposure:"US_EQUITY_3X_LONG",weight:"0.55"},{exposure:"LONG_TREASURY_3X_LONG",weight:"0.45"}],rebalanceThreshold:"0.05",reviewFrequency:"QUARTERLY"};
      if(key==="golden-butterfly")config={allocations:[{exposure:"US_LARGE_CAP",weight:"0.20"},{exposure:"US_SMALL_CAP_VALUE",weight:"0.20"},{exposure:"LONG_TREASURY",weight:"0.20"},{exposure:"SHORT_TREASURY",weight:"0.20"},{exposure:"GOLD",weight:"0.20"}],rebalanceThreshold:"0.05",reviewFrequency:"ANNUAL"};
      const versionQuery="INSERT INTO strategy_versions (strategy_definition_id,version,effective_from,config,disclosure) VALUES ($1,'1.0','2026-01-01',$2::jsonb,$3) ON CONFLICT (strategy_definition_id,version) DO UPDATE SET config=EXCLUDED.config,disclosure=EXCLUDED.disclosure";
      await sql.unsafe(versionQuery,[id,JSON.stringify(config),"Rule calculator for a user-selected strategy. Not a suitability recommendation."]);
    }
    await sql.unsafe("INSERT INTO benchmarks (key,name,economic_exposure,description) VALUES ('global-equity','Global Equity','GLOBAL_EQUITY','Broad global equity benchmark') ON CONFLICT (key) DO NOTHING");
    console.log("Seed complete");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
