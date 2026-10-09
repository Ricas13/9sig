export type IndexedChartPoint={
 date:string;actual?:number;model?:number;benchmark?:number;benchmarkValues?:Record<string,number>;
};
const factor=(base:number|undefined,value:number|undefined)=>{
 if(base==null||value==null||!Number.isFinite(base)||base<=0||!Number.isFinite(value)||value<0)
   return undefined;
 return value/base*100;
};

/**
 * Convert life-to-date 100-based indices into period-specific 100-based growth.
 * Never pretend a series beginning AFTER the selected period is comparable:
 * its opening value must exist on the first actual chart observation.
 */
export function rebaseIndexedWindow<T extends IndexedChartPoint>(points:T[]):T[]{
 if(!points.length)return [];
 const anchor=points[0];
 const sourceKeys=Object.keys(anchor.benchmarkValues??{});
 return points.map(row=>({
   ...row,
   actual:factor(anchor.actual,row.actual),
   model:factor(anchor.model,row.model),
   benchmark:factor(anchor.benchmark,row.benchmark),
   benchmarkValues:Object.fromEntries(sourceKeys.flatMap(key=>{
     const rebased=factor(anchor.benchmarkValues?.[key],row.benchmarkValues?.[key]);
     return rebased==null?[]:[[key,rebased]];
   }))
 }));
}
