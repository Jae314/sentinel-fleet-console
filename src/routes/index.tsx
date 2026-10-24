import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel, PageHeader, RowsSkeleton, ago, Mono, EmptyState } from "@/components/console/common";
import { SeverityBadge, SourceBadge, VerdictBadge } from "@/components/console/badges";
import { useDetections, useFleetStats } from "@/data/queries";
import type { ProtectionState } from "@/data/types";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fleet Overview — Grim Reaper" },
      { name: "description", content: "Protection posture, detections and response metrics across 1,200 Windows endpoints." },
      { property: "og:title", content: "Fleet Overview — Grim Reaper" },
      { property: "og:description", content: "Protection posture, detections and response metrics across the fleet." },
    ],
  }),
  component: Overview,
});

const STATE_COLOR: Record<ProtectionState, string> = {
  Protected: "var(--success)",
  Degraded: "var(--warning)",
  Isolated: "var(--critical)",
  Unmanaged: "var(--muted-foreground)",
};

function useTicker(base: number | undefined, rate: number) {
  const [v, setV] = useState(base ?? 0);
  useEffect(() => {
    if (base === undefined) return;
    setV(base);
    const start = Date.now();
    const t = setInterval(() => setV(base + Math.floor(((Date.now() - start) / 1000) * rate * (0.92 + Math.random() * 0.16))), 250);
    return () => clearInterval(t);
  }, [base, rate]);
  return v;
}

function Kpi({ label, value, sub, loading }: { label: string; value: string; sub?: React.ReactNode; loading: boolean }) {
  return (
    <div className="panel p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      {loading ? <Skeleton className="mt-2 h-8 w-24 bg-muted" /> : <div className="mt-1.5 font-display text-2xl font-semibold tabular-nums">{value}</div>}
      <div className="mt-1 min-h-4 text-xs text-muted-foreground">{!loading && sub}</div>
    </div>
  );
}

function Overview() {
  const stats = useFleetStats();
  const dets = useDetections();
  const s = stats.data;
  const events = useTicker(s?.eventsProcessed, s?.eventsPerSecond ?? 0);
  const loading = stats.isLoading;
  const pie = s ? (Object.entries(s.byState) as [ProtectionState, number][]).map(([name, value]) => ({ name, value })) : [];

  return (
    <div>
      <PageHeader
        title="Fleet Overview"
        subtitle="Scaling from one protected lab laptop to the full corporate fleet."
        right={<span className="text-[11px] text-muted-foreground">Fleet totals include 1,199 simulated endpoints · 1 live</span>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi loading={loading} label="Endpoints protected" value={s ? `${s.byState.Protected.toLocaleString()} / ${s.total.toLocaleString()}` : ""}
          sub={s && `${((s.byState.Protected / s.total) * 100).toFixed(1)}% coverage`} />
        <Kpi loading={loading} label="Events processed" value={events.toLocaleString()}
          sub={s && <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />{s.eventsPerSecond.toLocaleString()} ev/s</span>} />
        <Kpi loading={loading} label="Detections (24h)" value={s ? String(s.detections24h) : ""} sub={s && `${s.pendingApprovals} awaiting approval`} />
        <Kpi loading={loading} label="Actions taken" value={s ? String(s.actionsAuto + s.actionsHuman) : ""}
          sub={s && <><span className="text-primary">{s.actionsAuto} auto</span> · <span className="text-success">{s.actionsHuman} human-approved</span></>} />
        <Kpi loading={loading} label="Mean time to respond" value={s ? `${Math.floor(s.mttrSeconds / 60)}m ${s.mttrSeconds % 60}s` : ""} sub="detection → execution" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Protection state">
          {loading ? <div className="p-6"><Skeleton className="mx-auto h-44 w-44 rounded-full bg-muted" /></div> : (
            <div className="flex items-center gap-4 p-4">
              <div className="h-44 w-44 shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pie} dataKey="value" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="none">
                      {pie.map((p) => <Cell key={p.name} fill={STATE_COLOR[p.name as ProtectionState]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-2 text-sm">
                {pie.map((p) => (
                  <li key={p.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-sm" style={{ background: STATE_COLOR[p.name as ProtectionState] }} />{p.name}</span>
                    <span className="tabular-nums text-muted-foreground">{p.value.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
        <Panel title="Detections — last 24h" className="lg:col-span-2">
          {loading ? <div className="p-4"><Skeleton className="h-52 w-full bg-muted" /></div> : (
            <div className="h-56 p-2 pr-4">
              <ResponsiveContainer>
                <AreaChart data={s!.trend}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} interval={3} />
                  <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
                  {(["Low", "Medium", "High", "Critical"] as const).map((k, i) => (
                    <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={`var(--chart-${4 - i})`} fill={`var(--chart-${4 - i})`} fillOpacity={0.25} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Most recent detections" className="mt-4" right={<Link to="/detections" className="text-xs text-primary hover:underline">View all →</Link>}>
        {dets.isLoading ? <RowsSkeleton /> : !dets.data?.length ? (
          <EmptyState icon={<ShieldAlert />} title="No detections yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  {["Time", "Endpoint", "Technique", "Severity", "Verdict", "Confidence"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {dets.data.slice(0, 8).map((d) => (
                  <tr key={d.id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{ago(d.timestamp)}</td>
                    <td className="px-4 py-2.5"><div className="flex items-center gap-2"><Mono>{d.hostname}</Mono><SourceBadge source={d.source} /></div></td>
                    <td className="px-4 py-2.5"><Link to="/detections" search={{ id: d.id }} className="hover:text-primary"><Mono className="text-primary">{d.technique.id}</Mono> <span className="text-xs">{d.technique.name}</span></Link></td>
                    <td className="px-4 py-2.5"><SeverityBadge s={d.severity} /></td>
                    <td className="px-4 py-2.5"><VerdictBadge v={d.verdict} /></td>
                    <td className="px-4 py-2.5 tabular-nums text-xs">{Math.round(d.confidence * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
