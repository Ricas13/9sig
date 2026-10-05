"use client";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartPoint } from "@/lib/benchmarks";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

export function GrowthChart({ data }: { data: ChartPoint[] }) {
  if (!data.length) return <div className="muted">The comparison chart will appear once there is enough market and portfolio history.</div>;
  return <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%">
    <LineChart data={data} margin={{ top:8,right:12,bottom:0,left:4 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8ebf2" />
      <XAxis dataKey="date" tickFormatter={(v)=>String(v).slice(0,7)} minTickGap={34} tick={{fontSize:11,fill:"#7a8497"}} axisLine={false} tickLine={false} />
      <YAxis tickFormatter={(v)=>gbp.format(Number(v))} width={72} tick={{fontSize:11,fill:"#7a8497"}} axisLine={false} tickLine={false} />
      <Tooltip formatter={(value)=>gbp.format(Number(value))} labelFormatter={(label)=>String(label)} />
      <Legend />
      <Line type="monotone" dataKey="qqq" name="QQQ + DCA" dot={false} strokeWidth={2} />
      <Line type="monotone" dataKey="threeX" name="3QQQ + DCA" dot={false} strokeWidth={2} />
      <Line type="monotone" dataKey="nineSig" name="3QQQ 9Sig + DCA" dot={false} strokeWidth={3} />
    </LineChart>
  </ResponsiveContainer></div>;
}