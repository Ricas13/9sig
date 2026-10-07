"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point={date:string; actual?:number; model?:number; benchmark?:number};
type Marker={date:string;type:"CONTRIBUTION"|"REVIEW";label:string};
const frames=["1M","3M","6M","YTD","1Y","3Y","5Y","MAX"];

function cutoff(frame:string) {
  const now=new Date();
  if(frame==="MAX") return null;
  if(frame==="YTD") return new Date(Date.UTC(now.getUTCFullYear(),0,1));
  const months=frame==="1M"?1:frame==="3M"?3:frame==="6M"?6:frame==="1Y"?12:frame==="3Y"?36:60;
  const d=new Date(now); d.setUTCMonth(d.getUTCMonth()-months); return d;
}

function compact(value:number){
  return new Intl.NumberFormat("en-GB",{notation:"compact",maximumFractionDigits:1}).format(value);
}

export function PerformanceChart({data,markers=[]}:{data:Point[];markers?:Marker[]}) {
  const gradientId=("actual-"+useId()).replaceAll(":","");
  const hasActual=data.some((point)=>point.actual!=null);
  const hasModel=data.some((point)=>point.model!=null);
  const hasBenchmark=data.some((point)=>point.benchmark!=null);
  const [frame,setFrame]=useState("MAX");
  const [showActual,setShowActual]=useState(hasActual);
  const [showModel,setShowModel]=useState(!hasActual&&hasModel);
  const [showBenchmark,setShowBenchmark]=useState(!hasActual&&!hasModel&&hasBenchmark);
  const [reduceMotion,setReduceMotion]=useState(false);

  useEffect(()=>{
    const media=window.matchMedia("(prefers-reduced-motion: reduce)");
    const update=()=>setReduceMotion(media.matches);
    update();
    media.addEventListener("change",update);
    return ()=>media.removeEventListener("change",update);
  },[]);

  const filtered=useMemo(()=>{
    const min=cutoff(frame); return min ? data.filter((p)=>new Date(p.date)>=min) : data;
  },[data,frame]);
  const filteredMarkers=useMemo(()=>{
    const min=cutoff(frame); return min ? markers.filter((m)=>new Date(m.date)>=min) : markers;
  },[markers,frame]);

  if(!data.length) return <div className="empty">Performance appears here once the strategy has enough valued history.</div>;

  return <div className="performance-chart">
    <div className="chart-toolbar">
      <div className="timeframes">{frames.map((f)=><button type="button" key={f} className={"timeframe "+(frame===f?"active":"")} onClick={()=>setFrame(f)}>{f}</button>)}</div>
      <div className="series-toggles" aria-label="Chart comparisons">
        {hasActual&&<button type="button" className={"series-chip actual "+(showActual?"active":"")} aria-pressed={showActual} onClick={()=>setShowActual(!showActual)}><span/>Your portfolio</button>}
        {hasModel&&<button type="button" className={"series-chip model "+(showModel?"active":"")} aria-pressed={showModel} onClick={()=>setShowModel(!showModel)}><span/>Strategy model</button>}
        {hasBenchmark&&<button type="button" className={"series-chip benchmark "+(showBenchmark?"active":"")} aria-pressed={showBenchmark} onClick={()=>setShowBenchmark(!showBenchmark)}><span/>Benchmark</button>}
      </div>
    </div>
    {filteredMarkers.length>0&&<div className="chart-markers" aria-label="Chart event markers"><span className="chart-marker-key contribution">+ Contributions</span><span className="chart-marker-key review">R Reviews</span></div>}
    <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%">
      <AreaChart data={filtered} margin={{top:22,right:8,left:0,bottom:0}}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#78f3c6" stopOpacity={.28}/><stop offset="100%" stopColor="#78f3c6" stopOpacity={0}/></linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="rgba(158,184,214,.085)"/>
        <XAxis dataKey="date" tick={{fill:"#7f95ae",fontSize:10}} axisLine={false} tickLine={false} minTickGap={30}/>
        <YAxis tick={{fill:"#7f95ae",fontSize:10}} tickFormatter={(v)=>compact(Number(v))} axisLine={false} tickLine={false} width={48}/>
        {filteredMarkers.map((marker,index)=><ReferenceLine key={marker.type+marker.date+index} x={marker.date} stroke={marker.type==="CONTRIBUTION"?"#79a8ff":"#ffd27a"} strokeOpacity={.42} strokeDasharray="3 5" label={{value:marker.type==="CONTRIBUTION"?"+":"R",position:"insideTop",fill:marker.type==="CONTRIBUTION"?"#79a8ff":"#ffd27a",fontSize:10}} ifOverflow="extendDomain"/>)}
        <Tooltip
          contentStyle={{background:"#0b192a",border:"1px solid rgba(158,184,214,.16)",borderRadius:14,boxShadow:"0 18px 50px rgba(0,0,0,.3)"}}
          labelStyle={{color:"#8ea3bd",fontSize:11}}
          itemStyle={{fontSize:12}}
          formatter={(value,name)=>[new Intl.NumberFormat("en-GB",{maximumFractionDigits:2}).format(Number(value)),String(name)]}
        />
        {showActual&&<Area type="monotone" dataKey="actual" name="Your portfolio" stroke="#78f3c6" fill={"url(#"+gradientId+")"} strokeWidth={3} connectNulls isAnimationActive={!reduceMotion} animationDuration={650}/>}
        {showModel&&<Area type="monotone" dataKey="model" name="Strategy model" stroke="#79a8ff" fillOpacity={0} strokeWidth={2.25} connectNulls isAnimationActive={!reduceMotion} animationDuration={650}/>}
        {showBenchmark&&<Area type="monotone" dataKey="benchmark" name="Benchmark" stroke="#ffd27a" fillOpacity={0} strokeWidth={2} connectNulls isAnimationActive={!reduceMotion} animationDuration={650}/>}
      </AreaChart>
    </ResponsiveContainer></div>
  </div>;
}
