"use client";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function AppError({reset}:{error:Error&{digest?:string};reset:()=>void}){
  return <section className="glass app-error" role="alert">
    <div className="app-error-icon"><AlertTriangle size={24}/></div>
    <div className="eyebrow">Something did not load</div>
    <h1>Your portfolio data is still safe.</h1>
    <p>This screen hit a temporary problem. Try the request again; no financial action is taken just by loading a page.</p>
    <button className="button primary" onClick={reset}><RotateCcw size={16}/>Try again</button>
  </section>;
}
