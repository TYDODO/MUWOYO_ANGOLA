import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Row = { created_at: string | null };

export default function UserGrowthChart({ rows, title = "Novos usuários" }: { rows: Row[]; title?: string }) {
  const data = useMemo(() => Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (13 - index));
    const key = date.toISOString().slice(0, 10);
    return { key, label: date.toLocaleDateString("pt-AO", { day: "2-digit", month: "short" }), count: rows.filter((row) => row.created_at?.slice(0, 10) === key).length };
  }), [rows]);

  return <Card className="border-border/60 shadow-sm"><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="pl-2"><ResponsiveContainer width="100%" height={240}><AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}><defs><linearGradient id="userGrowthFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} /><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.03} /></linearGradient></defs><CartesianGrid stroke="hsl(var(--border))" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Area type="monotone" dataKey="count" name="Usuários" stroke="hsl(var(--primary))" fill="url(#userGrowthFill)" /></AreaChart></ResponsiveContainer></CardContent></Card>;
}
