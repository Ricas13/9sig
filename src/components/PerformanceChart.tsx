"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point={
  date:string;
  actual?:number;
  model?:number;
  benchmark?:number;
  benchmarkValues?:Record<string,number>;
};
type Marker={date:string;type:"CONTRIBUTION"|"REVIEW";label:string};
type ComparisonSeries={key:string;label:string;defaultVisible?:boolean};
const frames=["1M","3M","6M","YTD","1Y","3Y","5Y","MAX"];
const comparisonColors=["var(--chart-comparison-1)","var(--chart-comparison-2)","var(--chart-comparison-3)","var(--chart-comparison-4)","var(--chart-comparison-5)","var(--chart-comparison-6)"];

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

export function PerformanceChart({
  data,markers=[],comparisons=[]
}:{
  data:Point[];
  markers?:Marker[];
  comparisons?:ComparisonSeries[];
}) {
  const gradientId=("actual-"+useId()).replaceAll(":","");
  const hasActual=data.some((point)=>point.actual!=null);
  const hasModel=data.some((point)=>point.model!=null);
  const hasLegacyBenchmark=data.some((point)=>point.benchmark!=null);
  const availableComparisons=useMemo(
    ()=>comparisons.length
      ?comparisons
      :hasLegacyBenchmark?[{key:"legacy-benchmark",label:"Benchmark",defaultVisible:!hasActual&&!hasModel}]:[],
    [comparisons,hasLegacyBenchmark,hasActual,hasModel]
  );
  const [frame,setFrame]=useState("MAX");
  const [showActual,setShowActual]=useState(hasActual);
  const [showModel,setShowModel]=useState(!hasActual&&hasModel);
  const [visibleComparisons,setVisibleComparisons]=useState<Record<string,boolean>>(
    ()=>Object.fromEntries(availableComparisons.map((series)=>[series.key,Boolean(series.defaultVisible)]))
  );
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
      <div className="timeframes">{frames.map((f)=><button type="button" key={f} className={"timeframe "+(frame===f?"active":"")} aria-pressed={frame===f} onClick={()=>setFrame(f)}>{f}</button>)}</div>
      <div className="series-toggles" aria-label="Chart comparisons">
        {hasActual&&<button type="button" className={"series-chip actual "+(showActual?"active":"")} aria-pressed={showActual} onClick={()=>setShowActual(!showActual)}><span/>Your portfolio</button>}
        {hasModel&&<button type="button" className={"series-chip model "+(showModel?"active":"")} aria-pressed={showModel} onClick={()=>setShowModel(!showModel)}><span/>Strategy model</button>}
        {availableComparisons.map((series,index)=>{
          const active=Boolean(visibleComparisons[series.key]);
          return <button
            type="button"
            key={series.key}
            className={"series-chip benchmark "+(active?"active":"")}
            aria-pressed={active}
            onClick={()=>setVisibleComparisons((current)=>({...current,[series.key]:!current[series.key]}))}
          ><span style={{background:comparisonColors[index%comparisonColors.length]}}/>{series.label}</button>;
        })}
      </div>
    </div>
    {filteredMarkers.length>0&&<div className="chart-markers" aria-label="Chart event markers"><span className="chart-marker-key contribution">+ Contributions</span><span className="chart-marker-key review">R Reviews</span></div>}
    <div className="chart-wrap" role="img" aria-label="Interactive portfolio performance chart"><ResponsiveContainer width="100%" height="100%">
      <AreaChart data={filtered} margin={{top:22,right:8,left:0,bottom:0}} accessibilityLayer>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-actual)" stopOpacity={.28}/><stop offset="100%" stopColor="var(--chart-actual)" stopOpacity={0}/></linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)"/>
        <XAxis dataKey="date" tick={{fill:"var(--chart-axis)",fontSize:10}} axisLine={false} tickLine={false} minTickGap={30}/>
        <YAxis tick={{fill:"var(--chart-axis)",fontSize:10}} tickFormatter={(v)=>compact(Number(v))} axisLine={false} tickLine={false} width={48}/>
        {filteredMarkers.map((marker,index)=><ReferenceLine key={marker.type+marker.date+index} x={marker.date} stroke={marker.type==="CONTRIBUTION"?"var(--chart-model)":"var(--chart-comparison-1)"} strokeOpacity={.42} strokeDasharray="3 5" label={{value:marker.type==="CONTRIBUTION"?"+":"R",position:"insideTop",fill:marker.type==="CONTRIBUTION"?"var(--chart-model)":"var(--chart-comparison-1)",fontSize:10}} ifOverflow="extendDomain"/>)}
        <Tooltip
          contentStyle={{background:"var(--chart-tooltip-bg)",border:"1px solid var(--line)",borderRadius:14,boxShadow:"var(--shadow)",color:"var(--text)"}}
          labelStyle={{color:"var(--muted)",fontSize:11}}
          itemStyle={{fontSize:12}}
          formatter={(value,name)=>[new Intl.NumberFormat("en-GB",{maximumFractionDigits:2}).format(Number(value)),String(name)]}
        />
        {showActual&&<Area type="monotone" dataKey="actual" name="Your portfolio" stroke="var(--chart-actual)" fill={"url(#"+gradientId+")"} strokeWidth={3} connectNulls isAnimationActive={!reduceMotion} animationDuration={650}/>}
        {showModel&&<Area type="monotone" dataKey="model" name="Strategy model" stroke="var(--chart-model)" fillOpacity={0} strokeWidth={2.25} connectNulls isAnimationActive={!reduceMotion} animationDuration={650}/>}
        {availableComparisons.map((series,index)=>visibleComparisons[series.key]&&<Area
          key={series.key}
          type="monotone"
          dataKey={(point:Point)=>series.key==="legacy-benchmark"?point.benchmark:point.benchmarkValues?.[series.key]}
          name={series.label}
          stroke={comparisonColors[index%comparisonColors.length]}
          fillOpacity={0}
          strokeWidth={2}
          connectNulls
          isAnimationActive={!reduceMotion}
          animationDuration={650}
        />)}
      </AreaChart>
    </ResponsiveContainer></div>
  </div>;
}
