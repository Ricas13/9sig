/**
 * Research-backed reference profiles. These are NOT automatically published:
 * regulated instruments, regional wrappers and live quotes must be verified first.
 * Allocation exposures are abstract asset classes rather than ticker guarantees.
 */
export type StrategyProfile = {
  key: string;
  name: string;
  engine: "FIXED_ALLOCATION" | "VALUE_TARGET" | "MOMENTUM" | "CUSTOM_PENDING";
  launchState: "DRAFT_REQUIRES_VERIFICATION";
  config?: Record<string, unknown>;
  rules: string;
  research: string[];
  risks: string[];
};
const fixed = (allocations: [string,string][], frequency:"MONTHLY"|"QUARTERLY"|"ANNUAL") => ({
  allocations: allocations.map(([exposure,weight])=>({exposure,weight})),
  reviewFrequency:frequency,
  rebalanceThreshold:"0.00"
});
export const RESEARCH_STRATEGIES: readonly StrategyProfile[] = [
  {
    key:"hfea",name:"Hedgefundie Excellent Adventure (classic)",engine:"FIXED_ALLOCATION",launchState:"DRAFT_REQUIRES_VERIFICATION",
    config:fixed([["US_EQUITY_3X_LONG","0.55"],["LONG_TREASURY_3X_LONG","0.45"]],"QUARTERLY"),
    rules:"Target 55% 3x S&P 500 (UPRO) and 45% 3x long-duration US Treasuries (TMF); rebalance on quarter reviews. TQQQ is NOT the original HFEA stock leg.",
    research:["https://www.reddit.com/r/LETFs/comments/r25c3n/","https://www.reddit.com/r/LETFs/comments/pkkoao/"],
    risks:["Daily leverage resets and path dependency","Bonds and equities can fall together","UK ISA/UCITS substitutions must not be assumed equivalent"]
  },
  {
    key:"golden-butterfly",name:"Golden Butterfly",engine:"FIXED_ALLOCATION",launchState:"DRAFT_REQUIRES_VERIFICATION",
    config:fixed([["US_LARGE_CAP","0.20"],["US_SMALL_CAP_VALUE","0.20"],["LONG_TREASURY","0.20"],["SHORT_TREASURY","0.20"],["GOLD","0.20"]],"ANNUAL"),
    rules:"Five 20% sleeves: large-cap stocks, small-cap value stocks, long Treasuries, short Treasuries, gold. Annual review/rebalance is a configurable profile, not a claim about the only canonical schedule.",
    research:["https://portfoliocharts.com/portfolios/golden-butterfly-portfolio/"],
    risks:["US factor/instrument mapping varies by jurisdiction","Gold implementation and fees vary"]
  },
  {
    key:"permanent-portfolio",name:"Permanent Portfolio",engine:"FIXED_ALLOCATION",launchState:"DRAFT_REQUIRES_VERIFICATION",
    config:fixed([["BROAD_EQUITY","0.25"],["LONG_TREASURY","0.25"],["CASH_BILLS","0.25"],["GOLD","0.25"]],"ANNUAL"),
    rules:"Harry Browne style equal quarters in stocks, long government bonds, cash or T-bills, and gold. Threshold bands are variants and require explicit versioning.",
    research:["https://portfoliocharts.com/portfolios/permanent-portfolio/"],
    risks:["Interest-rate/inflation exposure","Cash sleeve and home-currency choices matter"]
  },
  {
    key:"all-weather",name:"All Weather (unlevered reference)",engine:"FIXED_ALLOCATION",launchState:"DRAFT_REQUIRES_VERIFICATION",
    config:fixed([["BROAD_EQUITY","0.30"],["LONG_TREASURY","0.40"],["INTERMEDIATE_TREASURY","0.15"],["GOLD","0.075"],["BROAD_COMMODITIES","0.075"]],"ANNUAL"),
    rules:"Commonly circulated unlevered 30/40/15/7.5/7.5 All Weather approximation; NOT an official, single canonical Ray Dalio product or risk-parity implementation.",
    research:["https://portfoliocharts.com/portfolios/all-seasons-portfolio/"],
    risks:["Commodities and tax-wrapper availability","Allocation differs from true risk parity"]
  },
  {
    key:"three-fund",name:"Three-Fund Portfolio",engine:"FIXED_ALLOCATION",launchState:"DRAFT_REQUIRES_VERIFICATION",
    config:fixed([["DOMESTIC_EQUITY","0.40"],["INTERNATIONAL_EQUITY","0.40"],["AGGREGATE_BONDS","0.20"]],"ANNUAL"),
    rules:"Illustrative weights only. Domestic/international equity and bond targets are USER SETTINGS, not a universal 40/40/20 rule.",
    research:["https://www.bogleheads.org/wiki/Three-fund_portfolio"],risks:["Home bias","Bond duration and currency"]
  },
  {
    key:"60-40",name:"60/40 Portfolio",engine:"FIXED_ALLOCATION",launchState:"DRAFT_REQUIRES_VERIFICATION",
    config:fixed([["BROAD_EQUITY","0.60"],["AGGREGATE_BONDS","0.40"]],"ANNUAL"),
    rules:"60% diversified equities and 40% bonds; review annually with user-customisable drift thresholds.",
    research:["https://www.bogleheads.org/wiki/Asset_allocation"],risks:["Stock-bond correlations can change"]
  },
  {
    key:"80-20",name:"80/20 Portfolio",engine:"FIXED_ALLOCATION",launchState:"DRAFT_REQUIRES_VERIFICATION",
    config:fixed([["BROAD_EQUITY","0.80"],["AGGREGATE_BONDS","0.20"]],"ANNUAL"),
    rules:"80% diversified equities and 20% bonds; review annually.",
    research:["https://www.bogleheads.org/wiki/Asset_allocation"],risks:["High equity drawdown potential"]
  },
  {
    key:"dual-momentum",name:"Global Dual Momentum",engine:"MOMENTUM",launchState:"DRAFT_REQUIRES_VERIFICATION",
    rules:"Compare specified equity assets over a versioned 12-month lookback; select the relative winner only if its absolute return exceeds the explicitly configured defensive hurdle, otherwise hold defensive assets. Review monthly. Exact universes, signals, lookback, end-of-month convention and defensive asset MUST be explicit.",
    research:["https://www.optimalmomentum.com/global-equities-momentum/"],risks:["Whipsaws","Look-ahead bias","Missing historical data must block trades"]
  },
  {
    key:"gtaa-ivy",name:"GTAA / Ivy",engine:"MOMENTUM",launchState:"DRAFT_REQUIRES_VERIFICATION",
    rules:"Define the exact Faber-style 10-month moving-average timing universe and cash rules, then evaluate monthly. Variants are separate immutable strategy versions.",
    research:["https://mebfaber.com/2007/06/"],
    risks:["Return series and dividend adjustments","No universal GTAA specification"]
  },
  {
    key:"paa",name:"Protective Asset Allocation",engine:"MOMENTUM",launchState:"DRAFT_REQUIRES_VERIFICATION",
    rules:"Requires exact published PAA risk and protection universes, momentum metrics, breadth rules and protection allocation; not safely represented by generic relative momentum.",
    research:["https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2759734"],risks:["Complex regime/breadth calculations"]
  },
  {
    key:"vaa",name:"Vigilant Asset Allocation",engine:"MOMENTUM",launchState:"DRAFT_REQUIRES_VERIFICATION",
    rules:"Requires exact VAA offensive/defensive universes and multi-horizon momentum scoring; distinct from PAA.",
    research:["https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3002624"],risks:["Whipsaw","Trading-calendar precision"]
  },
  ...(["3sig","6sig"] as const).map(key=>({
    key,name:key.toUpperCase()+" (research pending)",engine:"CUSTOM_PENDING" as const,launchState:"DRAFT_REQUIRES_VERIFICATION" as const,
    rules:"Do not infer "+key+" parameters by renaming the 9Sig engine. Verify the source book's target growth, signal frequency, bands, cash management and reset rules before publication.",
    research:["https://jasonkelly.com/2017/01/how-my-signal-system-works/","https://jasonkelly.com/books/3sig/","https://jasonkelly.com/"], risks:["Proprietary method ambiguity","Version-specific interpretation"]
  }))
];
