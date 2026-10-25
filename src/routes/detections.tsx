import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Search, ShieldAlert, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Panel, PageHeader, RowsSkeleton, ago, Mono, EmptyState } from "@/components/console/common";
import { ActionStatusBadge, RiskBadge, SeverityBadge, SourceBadge, VerdictBadge } from "@/components/console/badges";
import { useActions, useApprove, useDetections, useRequestAction } from "@/data/queries";
import type { Detection } from "@/data/types";
import { cn } from "@/lib/utils";

type Search = { id?: string | undefined; severity?: string | undefined; verdict?: string | undefined; source?: string | undefined; q?: string | undefined };

export const Route = createFileRoute("/detections")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    id: typeof s["id"] === "string" ? s["id"] : undefined,
    severity: typeof s["severity"] === "string" ? s["severity"] : undefined,
    verdict: typeof s["verdict"] === "string" ? s["verdict"] : undefined,
    source: typeof s["source"] === "string" ? s["source"] : undefined,
    q: typeof s["q"] === "string" ? s["q"] : undefined,
  }),
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Detections & Triage — Grim Reaper" },
      { name: "description", content: "AI-triaged detections with MITRE mapping and verified evidence." },
      { property: "og:title", content: "Detections & Triage — Grim Reaper" },
      { property: "og:description", content: "AI-triaged detections with MITRE mapping and verified evidence." },
    ],
  }),
  component: Detections,
});

function FilterSelect({ value, onChange, placeholder, options }: { value?: string | undefined; onChange: (v?: string) => void; placeholder: string; options: [string, string][] }) {
  return (
    <Select value={value ?? "all"} onValueChange={(v) => onChange(v === "all" ? undefined : v)}>
      <SelectTrigger className="h-9 w-[150px] bg-card"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {placeholder.toLowerCase()}</SelectItem>
        {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function Detections() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data, isLoading } = useDetections();
  const [limit, setLimit] = useState(60);
  const set = (patch: Partial<Search>) => navigate({ to: ".", search: (p) => ({ ...p, ...patch }), replace: true });

  const filtered = useMemo(() => {
    const q = search.q?.toLowerCase();
    return (data ?? []).filter((d) =>
      (!search.severity || d.severity === search.severity) &&
      (!search.verdict || d.verdict === search.verdict) &&
      (!search.source || d.source === search.source) &&
      (!q || [d.hostname, d.technique.id, d.technique.name, d.rule, d.id].some((x) => x.toLowerCase().includes(q))),
    );
  }, [data, search]);

  const selected = data?.find((d) => d.id === search.id) ?? filtered[0];

  return (
    <div>
      <PageHeader title="Detections & Triage" subtitle="Every verdict is grounded in event IDs verified against the log store." />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search.q ?? ""} onChange={(e) => set({ q: e.target.value || undefined })} placeholder="Search host, technique, rule…" className="h-9 bg-card pl-8" />
        </div>
        <FilterSelect placeholder="Severities" value={search.severity} onChange={(v) => set({ severity: v })} options={["Critical", "High", "Medium", "Low"].map((s) => [s, s])} />
        <FilterSelect placeholder="Verdicts" value={search.verdict} onChange={(v) => set({ verdict: v })} options={[["Malicious", "Malicious"], ["Benign", "Benign"], ["NeedsMoreEvidence", "Needs evidence"]]} />
        <FilterSelect placeholder="Sources" value={search.source} onChange={(v) => set({ source: v })} options={[["live", "Live"], ["simulated", "Simulated"]]} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-3" title={isLoading ? "Loading…" : `${filtered.length} detections`}>
          {isLoading ? <RowsSkeleton rows={10} /> : !filtered.length ? (
            <EmptyState icon={<ShieldAlert />} title="No detections match these filters" hint="Try clearing a filter or broadening your search." />
          ) : (
            <ul className="max-h-[70vh] overflow-y-auto">
              {filtered.slice(0, limit).map((d) => (
                <li key={d.id}>
                  <button onClick={() => set({ id: d.id })}
                    className={cn("flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-accent/40", selected?.id === d.id && "bg-accent/60 shadow-[inset_2px_0_0_var(--primary)]")}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Mono className="text-primary">{d.technique.id}</Mono>
                        <span className="truncate text-sm">{d.technique.name}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Mono>{d.hostname}</Mono><SourceBadge source={d.source} hostname={d.hostname} /><span>· {ago(d.timestamp)}</span>
                        {!d.evidenceVerified && <span className="flex items-center gap-1 text-critical"><AlertTriangle className="h-3 w-3" />unverified</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1"><SeverityBadge s={d.severity} /><VerdictBadge v={d.verdict} /></div>
                  </button>
                </li>
              ))}
              {filtered.length > limit && (
                <li className="p-3 text-center"><Button variant="ghost" size="sm" onClick={() => setLimit(limit + 60)}>Show more ({filtered.length - limit} remaining)</Button></li>
              )}
            </ul>
          )}
        </Panel>
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-20">
            {isLoading ? <Panel><RowsSkeleton rows={8} /></Panel> : selected ? <DetailPanel d={selected} /> : (
              <Panel><EmptyState icon={<ShieldAlert />} title="Select a detection" /></Panel>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailPanel({ d }: { d: Detection }) {
  const { data: actions } = useActions();
  const approve = useApprove();
  const request = useRequestAction();
  const action = actions?.find((a) => a.id === d.actionId);
  const pct = Math.round(d.confidence * 100);
  const busy = approve.isPending || request.isPending;

  return (
    <Panel>
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <Mono className="text-muted-foreground">{d.id}</Mono>
          <div className="flex items-center gap-2"><Mono>{d.hostname}</Mono><SourceBadge source={d.source} hostname={d.hostname} /></div>
        </div>
        <h2 className="mt-2 text-lg font-semibold leading-snug">{d.technique.name}</h2>
        <div className="mt-1 text-xs text-muted-foreground">
          <Mono className="text-primary">{d.technique.id}</Mono> · {d.technique.tactic} · {d.rule}
        </div>
      </div>

      <div className="space-y-5 p-4">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">AI verdict</div>
            <div className="mt-1 flex gap-2"><VerdictBadge v={d.verdict} /><SeverityBadge s={d.severity} /></div>
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-[11px] uppercase tracking-wider text-muted-foreground"><span>Confidence</span><span className="tabular-nums text-foreground">{pct}%</span></div>
            <div className="mt-1.5 h-1.5 rounded-full bg-muted">
              <div className={cn("h-full rounded-full", pct >= 80 ? "bg-primary" : pct >= 60 ? "bg-warning" : "bg-muted-foreground")} style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Evidence events</div>
          {!d.evidenceVerified && (
            <div className="mb-2 flex gap-2 rounded-md border border-critical/40 bg-critical/10 p-2.5 text-xs text-critical">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Evidence could not be verified in the log store. Response actions are disabled until the events are confirmed.</span>
            </div>
          )}
          <ul className="space-y-1">
            {d.evidenceEventIds.map((e) => (
              <li key={e} className="flex items-center justify-between rounded border border-border bg-surface px-2.5 py-1.5">
                <Mono>{e}</Mono>
                {d.evidenceVerified ? (
                  <span className="flex items-center gap-1 text-[11px] text-success"><CheckCircle2 className="h-3.5 w-3.5" />verified in log store</span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-critical"><AlertTriangle className="h-3.5 w-3.5" />not found</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground"><Sparkles className="h-3 w-3 text-primary" />Agent reasoning</div>
          <p className="text-sm leading-relaxed text-foreground/90">{d.reasoningSummary}</p>
        </div>

        {d.proposedAction === null ? <p className="text-sm text-muted-foreground">No action proposed — report only</p> : <div className="rounded-md border border-border bg-surface p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Proposed action</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{d.proposedAction.type}</span>
            <RiskBadge r={d.proposedAction.riskLevel} />
            {action && <ActionStatusBadge s={action.status} />}
          </div>
          <Mono className="mt-1 block break-all text-muted-foreground">{d.proposedAction.target}</Mono>
          <div className="mt-3 flex flex-wrap gap-2">
            {action?.status === "PendingApproval" ? (
              <Button size="sm" disabled={!d.evidenceVerified || busy} onClick={() => approve.mutate(action.id)}>
                Approve {action.mode === "DryRun" ? "(dry run)" : "& execute"}
              </Button>
            ) : !action && d.verdict !== "Benign" ? (
              <Button size="sm" disabled={!d.evidenceVerified || busy} onClick={() => request.mutate(d.id)}>Request action</Button>
            ) : null}
            {action && <Button size="sm" variant="outline" asChild><Link to="/response">Open in Response Center</Link></Button>}
          </div>
        </div>}
      </div>
    </Panel>
  );
}
