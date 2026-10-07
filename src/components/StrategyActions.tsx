"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RecalculateButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button className="button" disabled={busy} onClick={async () => {
    setBusy(true);
    await fetch("/api/strategies/" + id + "/calculate", { method: "POST" });
    setBusy(false);
    router.refresh();
  }}>Recalculate</button>;
}

export function ExecuteAction({ action }: { action: { id: string; actionType: string } }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const needsPrice = ["BUY", "SELL"].includes(action.actionType);
  return <form className="inline" onSubmit={async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const response = await fetch("/api/actions/" + action.id + "/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ price: f.get("price") || undefined, quantity: f.get("quantity") || undefined, fee: f.get("fee") || "0", partial:Boolean(f.get("partial")) })
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) return setError(body.error ?? "Could not complete action.");
    router.refresh();
  }}>
    {needsPrice && <>
      <input name="price" type="number" min="0" step="0.000001" placeholder="Execution price" required />
      <input name="quantity" type="number" min="0" step="0.00000001" placeholder="Actual quantity" required /><input name="fee" type="number" min="0" step="0.01" defaultValue="0" placeholder="Fee" /><label className="partial-fill"><input name="partial" type="checkbox"/><span>I only completed part of this trade</span></label>
    </>}
    <button className="button primary" disabled={busy}>{needsPrice ? "Mark trade completed" : "Mark reviewed"}</button>
    {error && <span className="error">{error}</span>}
  </form>;
}

export function ContributionForm({ id }: { id: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  return <form className="form-grid" onSubmit={async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const value = String(f.get("when") || "");
    const occurredAt = value ? new Date(value).toISOString() : undefined;
    const r = await fetch("/api/strategies/" + id + "/contributions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: String(f.get("amount")), occurredAt })
    });
    setMessage(r.ok ? "Contribution recorded as cash." : "Could not record contribution.");
    if (r.ok) {
      e.currentTarget.reset();
      router.refresh();
    }
  }}>
    <div className="field"><label>Contribution</label><input name="amount" type="number" min="0.01" step="0.01" required /></div>
    <div className="field"><label>Date & time</label><input name="when" type="datetime-local" /></div>
    <div className="field full"><button className="button">Record contribution</button>{message && <div className={message.startsWith("Contribution recorded") ? "success" : "error"}>{message}</div>}</div>
  </form>;
}

export function ReconcileForm({ id, expected }: { id: string; expected?: number | null }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  return <form className="form-grid" onSubmit={async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await fetch("/api/strategies/" + id + "/reconcile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedValue: String(f.get("expected")),
        brokerValue: String(f.get("broker")),
        reason: f.get("reason") || undefined,
        affectsCash: Boolean(f.get("affectsCash"))
      })
    });
    const b = await r.json();
    setMessage(r.ok
      ? (b.resolved ? "Reconciliation resolved." : "Reconciliation recorded, but the strategy remains blocked until the discrepancy is resolved.")
      : b.error);
    if (r.ok) router.refresh();
  }}>
    <div className="field"><label>Expected value</label><input name="expected" type="number" min="0" step="0.01" defaultValue={expected ?? undefined} required /></div>
    <div className="field"><label>Broker reported value</label><input name="broker" type="number" min="0" step="0.01" required /></div>
    <div className="field full"><label>Reason</label><select name="reason"><option value="">Unknown adjustment</option><option>Broker fee</option><option>FX cost</option><option>Tax</option><option>Financing cost</option><option>Interest</option><option>Other</option></select></div>
    <div className="field full">
      <label><input name="affectsCash" type="checkbox" /> This difference definitely changes available cash</label>
      <div className="help">Use this for a fee, tax, financing or FX cash charge. Leave it off for an unexplained valuation difference; actions stay blocked instead of treating unknown drift as spendable cash.</div>
    </div>
    <div className="field full"><button className="button">Reconcile</button>{message && <div className={message.includes("resolved") ? "success" : "error"}>{message}</div>}</div>
  </form>;
}


export function OpeningSnapshotForm({ id }: { id: string }) {
  const router = useRouter();
  const [cash, setCash] = useState("0");
  const [holdings, setHoldings] = useState([{ ticker: "", exchange: "LSE", quantity: "" }]);
  const [message, setMessage] = useState("");

  function update(index: number, field: "ticker" | "exchange" | "quantity", value: string) {
    setHoldings((rows) => rows.map((row, i) => i === index ? { ...row, [field]: value } : row));
  }

  return <form className="stack" onSubmit={async (e) => {
    e.preventDefault();
    setMessage("");
    const cleanHoldings = holdings.filter((h) => h.ticker.trim() && h.exchange.trim() && h.quantity.trim());
    const response = await fetch("/api/strategies/" + id + "/opening-snapshot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cash, holdings: cleanHoldings })
    });
    const body = await response.json();
    setMessage(response.ok ? "Opening snapshot saved." : body.error ?? "Could not save snapshot.");
    if (response.ok) router.refresh();
  }}>
    <div className="field"><label>Current cash balance</label><input value={cash} onChange={(e) => setCash(e.target.value)} type="number" min="0" step="0.01" /></div>
    {holdings.map((holding, index) => <div className="form-grid" key={index}>
      <div className="field"><label>Ticker</label><input value={holding.ticker} onChange={(e) => update(index, "ticker", e.target.value)} placeholder="3QQQ" /></div>
      <div className="field"><label>Exchange</label><input value={holding.exchange} onChange={(e) => update(index, "exchange", e.target.value)} placeholder="LSE" /></div>
      <div className="field full"><label>Quantity</label><input value={holding.quantity} onChange={(e) => update(index, "quantity", e.target.value)} type="number" min="0" step="0.00000001" /></div>
    </div>)}
    <div className="inline">
      <button type="button" className="button" onClick={() => setHoldings((rows) => [...rows, { ticker: "", exchange: "LSE", quantity: "" }])}>Add holding</button>
      {holdings.length > 1 && <button type="button" className="button" onClick={() => setHoldings((rows) => rows.slice(0, -1))}>Remove last</button>}
      <button className="button primary">Save opening snapshot</button>
    </div>
    <div className="help">This records what you hold now. It does not invent historical trades, cost basis or contributions.</div>
    {message && <div className={message.startsWith("Opening snapshot saved") ? "success" : "error"}>{message}</div>}
  </form>;
}


export function StrategyLifecycleControls({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function change(next: "ACTIVE" | "PAUSED" | "CLOSED") {
    if (next === "CLOSED" && !confirm("Close this strategy? Its history will remain, but it cannot be reopened.")) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/strategies/" + id + "/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next })
    });
    const body = await response.json();
    setBusy(false);
    setMessage(response.ok ? "Strategy status updated." : body.error ?? "Could not update status.");
    if (response.ok) router.refresh();
  }

  return <div className="inline">
    {status === "ACTIVE" && <button className="button" disabled={busy} onClick={() => change("PAUSED")}>Pause strategy</button>}
    {status === "PAUSED" && <button className="button primary" disabled={busy} onClick={() => change("ACTIVE")}>Resume strategy</button>}
    {status !== "CLOSED" && <button className="button danger" disabled={busy} onClick={() => change("CLOSED")}>Close strategy</button>}
    {message && <span className={message.startsWith("Strategy status updated") ? "success" : "error"}>{message}</span>}
  </div>;
}


type VersionInputField={key:string;label:string;type:"text"|"number"|"date"|"select"|"boolean";required?:boolean;help?:string;default?:string|number|boolean;options?:Array<{label:string;value:string}>;min?:string|number;max?:string|number};

export function StrategyVersionUpgrade({
  id,currentVersion,targetVersionId,targetVersion,releaseNotes,upgradePolicy,inputSchema,currentSettings
}:{
  id:string;currentVersion:string;targetVersionId:string;targetVersion:string;releaseNotes?:string|null;upgradePolicy:string;
  inputSchema:VersionInputField[];currentSettings:Record<string,unknown>;
}){
  const router=useRouter();const[message,setMessage]=useState("");const[busy,setBusy]=useState(false);
  return <section className="glass form-card" style={{marginTop:16}}>
    <div className={"pill "+(upgradePolicy==="REQUIRED"?"bad":upgradePolicy==="RECOMMENDED"?"warn":"good")}>{upgradePolicy} UPDATE</div>
    <h3>Strategy release v{targetVersion} is available</h3>
    <p className="help">You are currently on v{currentVersion}. Updating changes future calculations only; historical actions keep the version that produced them.</p>
    {releaseNotes&&<p>{releaseNotes}</p>}
    <form className="form-grid" onSubmit={async(e)=>{
      e.preventDefault();setBusy(true);setMessage("");const f=new FormData(e.currentTarget);const settings:Record<string,unknown>={};
      for(const field of inputSchema){
        if(field.type==="boolean")settings[field.key]=Boolean(f.get("versionInput:"+field.key));
        else {const value=f.get("versionInput:"+field.key);if(value!==null&&String(value)!=="")settings[field.key]=String(value);}
      }
      const response=await fetch("/api/strategies/"+id+"/version",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({targetVersionId,settings})});
      const body=await response.json();setBusy(false);setMessage(response.ok?"Strategy updated to v"+targetVersion+".":body.error??"Could not update strategy.");
      if(response.ok)router.refresh();
    }}>
      {inputSchema.map((field)=><div className="field full" key={field.key}><label>{field.label}</label>
        {field.type==="select"?<select name={"versionInput:"+field.key} defaultValue={String(currentSettings[field.key]??field.default??"")} required={field.required}>{!field.required&&<option value="">Not set</option>}{field.options?.map((o)=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:
        field.type==="boolean"?<label><input name={"versionInput:"+field.key} type="checkbox" defaultChecked={Boolean(currentSettings[field.key]??field.default)}/> {field.help??field.label}</label>:
        <input name={"versionInput:"+field.key} type={field.type} defaultValue={currentSettings[field.key]==null?(field.default==null?undefined:String(field.default)):String(currentSettings[field.key])} required={field.required} min={field.min==null?undefined:String(field.min)} max={field.max==null?undefined:String(field.max)}/>}
        {field.help&&field.type!=="boolean"&&<div className="help">{field.help}</div>}
      </div>)}
      <div className="field full"><button className="button primary" disabled={busy}>Update to v{targetVersion}</button>{message&&<div className={message.startsWith("Strategy updated")?"success":"error"}>{message}</div>}</div>
    </form>
  </section>;
}


export function CashEventForm({id}:{id:string}){
  const router=useRouter();const[message,setMessage]=useState("");
  return <form className="form-grid" onSubmit={async(e)=>{
    e.preventDefault();const f=new FormData(e.currentTarget);const when=String(f.get("when")||"");
    const response=await fetch("/api/strategies/"+id+"/ledger-events",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      eventType:f.get("eventType"),amount:String(f.get("amount")),occurredAt:when?new Date(when).toISOString():undefined,note:f.get("note")||undefined
    })});
    const body=await response.json();setMessage(response.ok?"Cash event recorded.":body.error??"Could not record cash event.");
    if(response.ok){e.currentTarget.reset();router.refresh();}
  }}>
    <div className="field"><label>Event</label><select name="eventType"><option>WITHDRAWAL</option><option>DIVIDEND</option><option>DISTRIBUTION</option><option>INTEREST</option><option>FEE</option><option>TAX</option></select></div>
    <div className="field"><label>Amount</label><input name="amount" type="number" min="0.01" step="0.01" required/></div>
    <div className="field"><label>Date & time</label><input name="when" type="datetime-local"/></div>
    <div className="field"><label>Note (optional)</label><input name="note" maxLength={240}/></div>
    <div className="field full"><button className="button">Record cash event</button><div className="help">Withdrawals, fees and tax reduce cash; dividends, distributions and interest increase cash. The original ledger history remains append-only.</div>{message&&<div className={message.startsWith("Cash event recorded")?"success":"error"}>{message}</div>}</div>
  </form>;
}


export function ReverseLedgerEventButton({strategyId,eventId}:{strategyId:string;eventId:string}){
  const router=useRouter();const[busy,setBusy]=useState(false);const[error,setError]=useState("");
  return <button className="button" disabled={busy} onClick={async()=>{
    const reason=prompt("Why are you reversing this entry?");
    if(!reason?.trim())return;
    setBusy(true);setError("");
    const response=await fetch("/api/strategies/"+strategyId+"/ledger-events/"+eventId+"/correct",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reason:reason.trim()})});
    const body=await response.json();setBusy(false);
    if(!response.ok){setError(body.error??"Could not reverse entry.");return;}
    router.refresh();
  }}>Reverse entry{error?" · "+error:""}</button>;
}


export function ExecutionConstraintsForm({id,constraints}:{id:string;constraints?:Record<string,unknown>|null}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const value=constraints??{};
  return <form className="stack execution-preferences" onSubmit={async(e)=>{
    e.preventDefault();setBusy(true);setMessage("");
    const f=new FormData(e.currentTarget);
    const response=await fetch("/api/strategies/"+id+"/execution-constraints",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({
        fractionalShares:Boolean(f.get("fractionalShares")),
        minimumTradeAmount:String(f.get("minimumTradeAmount")||"0"),
        cashBufferAmount:String(f.get("cashBufferAmount")||"0"),
        flatFee:String(f.get("flatFee")||"0"),
        allowSelling:Boolean(f.get("allowSelling"))
      })
    });
    const body=await response.json();setBusy(false);
    if(!response.ok)return setMessage(body.error??"Could not save trade preferences.");
    setMessage("Saved. Your next action has been recalculated.");
    router.refresh();
  }}>
    <label className="toggle-row"><input type="checkbox" name="fractionalShares" defaultChecked={value.fractionalShares!==false}/><span><b>Fractional shares</b><small>Turn off if your broker only allows whole shares.</small></span></label>
    <div className="form-grid">
      <div className="field"><label>Minimum trade</label><input name="minimumTradeAmount" type="number" min="0" step="0.01" defaultValue={String(value.minimumTradeAmount??"0")}/></div>
      <div className="field"><label>Keep as cash</label><input name="cashBufferAmount" type="number" min="0" step="0.01" defaultValue={String(value.cashBufferAmount??"0")}/></div>
      <div className="field full"><label>Estimated fee per trade</label><input name="flatFee" type="number" min="0" step="0.01" defaultValue={String(value.flatFee??"0")}/></div>
    </div>
    <label className="toggle-row"><input type="checkbox" name="allowSelling" defaultChecked={value.allowSelling!==false}/><span><b>Allow sell recommendations</b><small>Turn off if you want new contributions to do the work wherever the strategy permits.</small></span></label>
    <div className="inline"><button className="button" disabled={busy}>{busy?"Saving…":"Save trade preferences"}</button>{message&&<span className={message.startsWith("Saved")?"success":"error"}>{message}</span>}</div>
  </form>;
}
