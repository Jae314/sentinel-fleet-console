import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, ListChecks, RotateCcw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PageHeader, RowsSkeleton, Mono, EmptyState, ago } from "@/components/console/common";
import { ExampleDataBanner, Pill, RiskBadge, SourceBadge } from "@/components/console/badges";
import { usesExamples } from "@/data/honesty";
import { useApplyTuning, useEndpoints, useRollbackTuning, useRuns, useTuningChanges, useValidateTuning } from "@/data/queries";
import { DATA_SOURCE } from "@/data/config";
import { safeTuningStatus, tuningProtectionViolation, visibleTestedTechniques } from "@/data/guardrails";
import type { LoggingConfig, TuningChange, TuningStatus } from "@/data/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tuning")({
  head: () => ({ meta: [
    { title: "Logging Tuning — Grim Reaper" },
    { name: "description", content: "Evidence-led logging improvements, validated configuration diffs and tested MITRE technique visibility." },
    { property: "og:title", content: "Logging Tuning — Grim Reaper" },
    { property: "og:description", content: "Audit logging changes, validation results and rollback snapshots." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: LoggingTuning,
});

const tones = { Proposed: "warning", Validated: "primary", Applied: "success", RolledBack: "info" } as const;
function Status({ status }: { status: TuningStatus }) { return <Pill tone={tones[status]}>{status}</Pill>; }
const fields: { key: keyof LoggingConfig; label: string }[] = [
  { key: "networkConnections", label: "Sysmon ID 3 · Network connections" },
  { key: "dnsQueries", label: "Sysmon ID 22 · DNS queries" },
  { key: "registryChanges", label: "Sysmon IDs 12–14 · Registry changes" },
  { key: "powerShellScriptBlock", label: "PowerShell ID 4104 · Script block logging" },
  { key: "managementChannel", label: "Management channel logging (protected)" },
  { key: "agentService", label: "Agent service logging (protected)" },
];

function LoggingTuning() {
  const changes = useTuningChanges();
  const runs = useRuns();
  const endpoints = useEndpoints();
  const [selectedId, setSelectedId] = useState<string>();
  const selected = changes.data?.find((c) => c.id === selectedId) ?? changes.data?.[0];
  const tested = (runs.data ?? []).filter((r) => r.hostId === selected?.hostId).flatMap((r) => r.testedTechniques);
  const count = visibleTestedTechniques(changes.data ?? [], tested, selected?.hostId ?? "");
  const host = endpoints.data?.find((e) => e.id === selected?.hostId);
  return <div>
    <ExampleDataBanner show={usesExamples(DATA_SOURCE, (changes.data ?? []).map((c) => c.source))} />
    <PageHeader title="Logging Tuning" right={<span className="text-xs text-muted-foreground">{host?.hostname ?? selected?.hostId} · techniques visible: <span className="text-primary">{count.visible} of {count.tested} tested</span></span>} />
    <div className="grid gap-4 lg:grid-cols-5">
      <Panel title="Logging changes" className="lg:col-span-2">
        {changes.isLoading ? <RowsSkeleton /> : changes.isError ? <EmptyState icon={<ShieldAlert />} title="Logging changes unavailable" hint={changes.error.message} /> : !changes.data?.length ? <EmptyState icon={<ListChecks />} title="No logging changes" /> : <ul>
          {changes.data.map((c, i) => <li key={c.id}><Button variant="ghost" onClick={() => setSelectedId(c.id)} className={cn("h-auto w-full justify-start whitespace-normal rounded-none border-b border-border/60 px-4 py-4 text-left", selected?.id === c.id && "bg-accent/60")}>
            <span className="self-start font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{c.visibilityGap}</span><span className="mt-2 flex flex-wrap items-center gap-2"><Mono>{c.id}</Mono><SourceBadge source={c.source} hostname={endpoints.data?.find((e) => e.id === c.hostId)?.hostname} /><Status status={safeTuningStatus(c)} /><span className="text-xs text-muted-foreground">{ago(c.timestamp)}</span></span></span>
          </Button></li>)}
        </ul>}
      </Panel>
      <div className="lg:col-span-3">{selected ? <TuningDetail change={selected} hostname={host?.hostname} /> : <Panel><EmptyState icon={<ListChecks />} title="No change selected" /></Panel>}</div>
    </div>
  </div>;
}

function TuningDetail({ change: c, hostname }: { change: TuningChange; hostname?: string | undefined }) {
  const validate = useValidateTuning();
  const apply = useApplyTuning();
  const rollback = useRollbackTuning();
  const status = safeTuningStatus(c);
  const busy = validate.isPending || apply.isPending || rollback.isPending;
  const violation = tuningProtectionViolation(c);
  return <Panel title={c.id} right={<Status status={status} />}>
    <div className="space-y-5 p-4">
      <div><div className="flex flex-wrap items-center gap-2"><Mono>{hostname ?? c.hostId}</Mono><SourceBadge source={c.source} hostname={hostname} /><RiskBadge r={c.riskLevel} /></div><h2 className="mt-2 text-lg font-semibold">{c.visibilityGap}</h2></div>
      <div><h3 className="mb-1 text-xs uppercase text-muted-foreground">Evidence</h3><p className="text-sm leading-relaxed">{c.evidence.observation}</p><div className="mt-2 flex flex-wrap gap-2">{c.evidence.eventIds.map((id) => <Mono key={id} className="text-primary">{id}</Mono>)}</div></div>
      <div><h3 className="mb-2 text-xs uppercase text-muted-foreground">{c.proposedChange.system === "Sysmon" ? "Sysmon configuration" : "PowerShell audit policy"} · before / after</h3>
        <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2 font-medium">Setting</th><th className="px-2 font-medium">Before</th><th className="px-2 font-medium">After</th></tr></thead><tbody>{fields.map(({ key, label }) => {
          const before = c.proposedChange.before[key]; const after = c.proposedChange.after[key];
          return <tr key={key} className={cn("border-b border-border/60", before !== after && "bg-primary/5")}><td className="py-2 pr-3">{label}</td><td className={cn("px-2 font-mono", before !== after && "text-critical")}>{before ? "Enabled" : "Disabled"}</td><td className={cn("px-2 font-mono", before !== after && "text-success")}>{after ? "+ Enabled" : "Disabled"}</td></tr>;
        })}</tbody></table></div>
      </div>
      <div><h3 className="mb-1 text-xs uppercase text-muted-foreground">Justification</h3><p className="text-sm leading-relaxed">{c.justification}</p></div>
      <div><h3 className="mb-2 text-xs uppercase text-muted-foreground">Validation</h3>{c.validationResult ? <div className="space-y-2 text-sm"><div className={cn("flex items-center gap-2", c.validationResult.configAccepted ? "text-success" : "text-critical")}><CheckCircle2 className="h-4 w-4" />Configuration {c.validationResult.configAccepted ? "accepted" : "rejected"}</div><div className={cn("flex items-center gap-2", c.validationResult.serviceRunning ? "text-success" : "text-critical")}><CheckCircle2 className="h-4 w-4" />Service {c.validationResult.serviceRunning ? "still running" : "not running"}</div><p className="text-xs text-muted-foreground">{c.validationResult.detail}</p></div> : <Pill tone="warning">Awaiting validation</Pill>}</div>
      {violation && <p className="flex items-center gap-2 text-sm text-critical"><ShieldAlert className="h-4 w-4" />Protected logging reduction blocked; rollback required.</p>}
      {status === "RolledBack" && <p className="text-xs text-info">Rollback recorded · snapshot {c.rollbackSnapshotId}</p>}
      <div><h3 className="mb-2 text-xs uppercase text-muted-foreground">{status === "Applied" ? "Techniques now visible" : "Techniques enabled by this proposal"}</h3><div className="flex flex-wrap gap-2">{c.techniquesNowVisible.map((t) => <Pill key={t} tone="primary">{t}</Pill>)}</div></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><Mono className="text-muted-foreground">Snapshot · {c.rollbackSnapshotId}</Mono>
        {DATA_SOURCE === "file" ? <Pill tone="muted">Read-only file data</Pill> : <div className="flex gap-2">{status === "Proposed" && <Button size="sm" disabled={busy || violation} onClick={() => validate.mutate(c.id)}><CheckCircle2 />Validate</Button>}{status === "Validated" && <Button size="sm" disabled={busy} onClick={() => apply.mutate(c.id)}><ListChecks />Apply</Button>}{status === "Applied" && <Button size="sm" variant="outline" disabled={busy} onClick={() => rollback.mutate(c.id)}><RotateCcw />Rollback</Button>}</div>}
      </div>
    </div>
  </Panel>;
}