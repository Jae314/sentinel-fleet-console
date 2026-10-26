import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Globe, Laptop, Search, UserCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Panel, PageHeader, RowsSkeleton, ago, Mono, EmptyState } from "@/components/console/common";
import { ExampleDataBanner, Pill, SourceBadge } from "@/components/console/badges";
import { usesExamples } from "@/data/honesty";
import { useBaselines, useEndpoints } from "@/data/queries";
import type { Baseline, Deviation } from "@/data/types";
import { cn } from "@/lib/utils";
import { DATA_SOURCE } from "@/data/config";

export const Route = createFileRoute("/baselines")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "User Baselining — Grim Reaper" },
      { name: "description", content: "Per-user behavior baselines: logon hours, usual processes and destinations, and review-only deviations." },
      { property: "og:title", content: "User Baselining — Grim Reaper" },
      { property: "og:description", content: "Per-user behavior baselines with review-only anomaly deviations." },
    ],
  }),
  component: UserBaselining,
});

const KIND_LABEL: Record<Deviation["kind"], string> = { LogonTime: "Odd-hours logon", NewProcess: "New process", NewDestination: "New destination" };

function UserBaselining() {
  const baselines = useBaselines();
  const endpoints = useEndpoints();
  const [selectedId, setSelectedId] = useState<string>();
  const selected = baselines.data?.find((b) => b.endpointId === selectedId) ?? baselines.data?.[0];
  const host = endpoints.data?.find((e) => e.id === selected?.endpointId);

  return (
    <div>
      <ExampleDataBanner show={usesExamples(DATA_SOURCE, (baselines.data ?? []).map((b) => b.source))} />
      <PageHeader title="User Baselining" subtitle="Learned behavior per user and host. Deviations are flagged for review only — they never trigger response actions." />
      <div className="mb-4 max-w-md">
        <Select value={selected?.endpointId ?? ""} onValueChange={setSelectedId}>
          <SelectTrigger className="h-9 bg-card"><SelectValue placeholder="Select endpoint / user" /></SelectTrigger>
          <SelectContent>
            {(baselines.data ?? []).map((b) => {
              const h = endpoints.data?.find((e) => e.id === b.endpointId);
              return <SelectItem key={b.endpointId} value={b.endpointId}>{h?.hostname ?? b.endpointId} · {b.user}</SelectItem>;
            })}
          </SelectContent>
        </Select>
      </div>
      {baselines.isLoading ? <Panel><RowsSkeleton rows={10} /></Panel>
        : baselines.isError ? <Panel><EmptyState icon={<UserCheck />} title="Baselines unavailable" hint={baselines.error.message} /></Panel>
        : !selected ? <Panel><EmptyState icon={<UserCheck />} title="No baselines yet" hint="Baselines appear once the agent has observed a host." /></Panel>
        : <BaselineDetail baseline={selected} hostname={host?.hostname} />}
    </div>
  );
}

function BaselineDetail({ baseline: b, hostname }: { baseline: Baseline; hostname?: string | undefined }) {
  const [procQ, setProcQ] = useState("");
  const [destQ, setDestQ] = useState("");
  const [openDev, setOpenDev] = useState<string>();
  const maxLogon = Math.max(1, ...b.logonHours);
  const procs = useMemo(() => b.usualProcesses.filter((p) => p.name.toLowerCase().includes(procQ.toLowerCase())), [b, procQ]);
  const dests = useMemo(() => b.usualDestinations.filter((d) => d.value.toLowerCase().includes(destQ.toLowerCase())), [b, destQ]);
  const deviations = useMemo(() => [...b.deviations].sort((a, z) => z.score - a.score), [b]);

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Mono className="text-sm">{hostname ?? b.endpointId}</Mono>
            <SourceBadge source={b.source ?? (DATA_SOURCE === "file" && hostname === "WIN11-LAB-01" ? "live" : "simulated")} hostname={hostname} />
            <Mono className="text-muted-foreground">{b.user}</Mono>
            <ButtonLink hostname={hostname ?? b.endpointId} />
          </div>
          {b.status === "Learning" ? (
            <Pill tone="warning" className="gap-2">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-live rounded-full bg-warning" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-warning" />
              </span>
              Learning — deviations are not flagged yet
            </Pill>
          ) : (
            <Pill tone="success">Active baseline</Pill>
          )}
        </div>
        <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          Learning window <Mono>{new Date(b.learningWindow.start).toLocaleDateString()}</Mono> → <Mono>{new Date(b.learningWindow.end).toLocaleDateString()}</Mono>
          {" · "}{b.learningWindow.eventCount.toLocaleString()} events observed
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Logon hours (24h)">
          <div className="p-4">
            <div className="flex h-28 items-end gap-1">
              {b.logonHours.map((n, h) => (
                <div key={h} className="group relative flex-1" title={`${String(h).padStart(2, "0")}:00 — ${n} logons`}>
                  <div className={cn("w-full rounded-sm", n ? "bg-primary/70 group-hover:bg-primary" : "bg-muted")} style={{ height: `${Math.max(4, (n / maxLogon) * 112)}px` }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>
          </div>
        </Panel>

        <Panel title="Usual processes" right={<SearchBox value={procQ} onChange={setProcQ} placeholder="Filter…" />}>
          <ul className="max-h-56 overflow-y-auto p-2">
            {procs.map((p) => (
              <li key={p.name} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent/40">
                <Mono>{p.name}</Mono>
                <span className="text-xs text-muted-foreground">{p.count}× · first {ago(p.firstSeen)}</span>
              </li>
            ))}
            {!procs.length && <li className="px-2 py-3 text-xs text-muted-foreground">No processes match.</li>}
          </ul>
        </Panel>

        <Panel title="Usual destinations" right={<SearchBox value={destQ} onChange={setDestQ} placeholder="Filter…" />}>
          <ul className="max-h-56 overflow-y-auto p-2">
            {dests.map((d) => (
              <li key={d.value} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent/40">
                <span className="flex min-w-0 items-center gap-1.5"><Globe className="h-3 w-3 shrink-0 text-muted-foreground" /><Mono className="truncate">{d.value}</Mono></span>
                <span className="shrink-0 text-xs text-muted-foreground">{d.type} · {d.count}×</span>
              </li>
            ))}
            {!dests.length && <li className="px-2 py-3 text-xs text-muted-foreground">No destinations match.</li>}
          </ul>
        </Panel>
      </div>

      <Panel title={b.status === "Learning" ? "Deviations (none flagged while learning)" : `Deviations (${deviations.length})`}>
        {b.status === "Learning" ? (
          <EmptyState icon={<Clock />} title="Baseline still learning" hint="Deviations are not flagged until the learning window completes and the baseline becomes Active." />
        ) : !deviations.length ? (
          <EmptyState icon={<CheckCircle2 />} title="No deviations" hint="Activity matches the learned baseline." />
        ) : (
          <ul>
            {deviations.map((d) => {
              const open = openDev === d.id;
              return (
                <li key={d.id} className="border-b border-border/60 last:border-0">
                  <button onClick={() => setOpenDev(open ? undefined : d.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/40">
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                    <Pill tone={d.score >= 0.8 ? "critical" : d.score >= 0.6 ? "warning" : "info"}>{KIND_LABEL[d.kind]}</Pill>
                    <span className="min-w-0 flex-1 truncate text-sm"><Mono>{d.subject}</Mono></span>
                    {!d.evidenceVerified && <span className="flex items-center gap-1 text-xs text-critical"><AlertTriangle className="h-3 w-3" />unverified</span>}
                    <span className="text-xs text-muted-foreground">{ago(d.timestamp)}</span>
                    <span className={cn("w-12 text-right font-mono text-sm tabular-nums", d.score >= 0.8 ? "text-critical" : d.score >= 0.6 ? "text-warning" : "text-info")}>{d.score.toFixed(2)}</span>
                  </button>
                  {open && (
                    <div className="space-y-3 border-t border-border/60 bg-surface px-4 py-3">
                      <p className="text-sm leading-relaxed text-foreground/90">{d.reason}</p>
                      {!d.evidenceVerified && (
                        <div className="flex gap-2 rounded-md border border-critical/40 bg-critical/10 p-2.5 text-xs text-critical">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>Evidence could not be verified in the log store. Treat this deviation with caution.</span>
                        </div>
                      )}
                      <ul className="space-y-1">
                        {d.evidenceEventIds.map((e) => (
                          <li key={e} className="flex items-center justify-between rounded border border-border bg-card px-2.5 py-1.5">
                            <Mono>{e}</Mono>
                            {d.evidenceVerified ? (
                              <span className="flex items-center gap-1 text-[11px] text-success"><CheckCircle2 className="h-3.5 w-3.5" />verified in log store</span>
                            ) : (
                              <span className="flex items-center gap-1 text-[11px] text-critical"><AlertTriangle className="h-3.5 w-3.5" />not found</span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <p className="text-[11px] text-muted-foreground">Review only — deviations never trigger response actions.</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-7 w-32 bg-card pl-7 text-xs" />
    </div>
  );
}

function ButtonLink({ hostname }: { hostname: string }) {
  return (
    <Link to="/endpoints" search={{ q: hostname }} className="flex items-center gap-1 text-xs text-primary hover:underline">
      <Laptop className="h-3 w-3" />View endpoint
    </Link>
  );
}
