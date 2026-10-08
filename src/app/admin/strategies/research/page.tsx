import { RESEARCH_STRATEGIES } from "@/domain/strategy/research-catalog";
export const dynamic="force-dynamic";
const ready=(key:string)=>key==="hfea"||key==="golden-butterfly";
export default function ResearchCatalogPage(){
 return <><div className="page-title"><div><div className="eyebrow">Admin · Strategies</div><h1>Research strategy catalog</h1><p>Review candidate strategy methodologies before drafting a release. None of these presets can be published automatically.</p></div></div>
 <section className="card"><h2>{RESEARCH_STRATEGIES.length} research profiles</h2><p className="help">Allocation and momentum research is not approval to send trades. Verify historical data, execution constraints, broker eligibility and independent reference cases before any release.</p><p><a href="/admin/strategies">Open strategy administration</a> · <a href="/admin/launch">Launch readiness</a></p></section>
 <div className="detail-grid" style={{marginTop:16}}>{RESEARCH_STRATEGIES.map(profile=><section className="card" key={profile.key}><div className="eyebrow">{profile.engine} · Research only</div><h3>{profile.name}</h3><p>{profile.rules}</p>
 {profile.config&&<details><summary>Reference configuration (not deployed)</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(profile.config,null,2)}</pre></details>}
 <h4>Risks</h4><ul>{profile.risks.map(r=><li key={r}>{r}</li>)}</ul>
 <h4>Research sources</h4><ul>{profile.research.map(url=><li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{new URL(url).hostname}</a></li>)}</ul>
 <p className="help">{ready(profile.key)?"Fixed-allocation reference configuration available; actual instrument fidelity not approved.":"Research-only rules or an unimplemented workflow; no customer publication."}</p>
 </section>)}</div></>;
}
