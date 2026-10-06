"use client";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";

type Point={date:string; actual?:number; model?:number; benchmark?:number};
const frames=["1M","3M","6M","YTD","1Y","3Y","5Y","MAX"];

function cutoff(frame:string) {
  const now=new Date();
  if(frame==="MAX") return null;
  if(frame==="YTD") return new Date(Date.UTC(now.getUTCFullYear(),0,1));
  const months=frame==="1M"?1:frame==="3M"?3:frame==="6M"?6:frame==="1Y"?12:frame==="3Y"?36:60;
  const d=new Date(now); d.setUTCMonth(d.getUTCMonth()-months); return d;
}

export function PerformanceChart({data}:{data:Point[]}) {
  const [frame,setFrame]=useState("MAX");
  const filtered=useMemo(()=>{
    const min=cutoff(frame); return min ? data.filter((p)=>new Date(p.date)>=min) : data;
  },[data,frame]);
  if(!data.length) return <div className="empty">Performance appears here once the strategy has enough valued history.</div>;
  return <div>
    <div className="timeframes">{frames.map((f)=><button key={f} className={"timeframe "+(frame===f?"active":"")} onClick={()=>setFrame(f)}>{f}</button>)}</div>
    <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%">
      <AreaChart data={filtered} margin={{top:18,right:8,left:0,bottom:0}}>
        <defs>
          <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#78f3c6" stopOpacity={.25}/><stop offset="100%" stopColor="#78f3c6" stopOpacity={0}/></linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="rgba(158,184,214,.10)"/>
        <XAxis dataKey="date" tick={{fill:"#7f95ae",fontSize:11}} axisLine={false} tickLine={false} minTickGap={28}/>
        <YAxis tick={{fill:"#7f95ae",fontSize:11}} axisLine={false} tickLine={false} width={54}/>
        <Tooltip contentStyle={{background:"#0f1e31",border:"1px solid rgba(158,184,214,.16)",borderRadius:14}}/>
        <Legend/>
        <Area type="monotone" dataKey="actual" name="Actual" stroke="#78f3c6" fill="url(#actualFill)" strokeWidth={3} connectNulls/>
        <Area type="monotone" dataKey="model" name="Model" stroke="#79a8ff" fillOpacity={0} strokeWidth={2} connectNulls/>
        <Area type="monotone" dataKey="benchmark" name="Benchmark" stroke="#ffd27a" fillOpacity={0} strokeWidth={2} connectNulls/>
      </AreaChart>
    </ResponsiveContainer></div>
  </div>;
}
