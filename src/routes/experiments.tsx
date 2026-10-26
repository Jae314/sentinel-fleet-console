import { createFileRoute, Link } from "@tanstack/react-router";
import { FlaskConical, ShieldAlert, ArrowUpRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState, Mono, PageHeader, Panel, RowsSkeleton } from "@/components/console/common";
import { ExampleDataBanner, Pill, ResponseEffectBadge } from "@/components/console/badges";
import { useActions, useExperiments, useTuningChanges } from "@/data/queries";
import { DATA_SOURCE } from "@/data/config";
import { compareRuns, OUTCOMES, OUTCOME_LEGEND, rateChange, runMetrics, selectExperimentSession } from "@/data/experiments";
import type { ExperimentComparison, ExperimentOutcome, ExperimentResult, ExperimentRun, ExperimentSnapshot } from "@/data/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/experiments")({
  head: () => ({ meta: [
    { title: "Experiments — Grim Reaper" },
    { name: "description", content: "Recorded security scenarios, repeatability and before-versus-after logging tuning results." },
    { property: "og:title", content: "Experiments — Grim Reaper" },
    { property: "og:description", content: "Compare scenario outcomes, detection rates and precision from recorded experiments." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Experiments,
});

const tones = { TruePositive: "success", FalsePositive: "warning", FalseNegative: "critical", TrueNegative: "muted", VisibilityGap: "info" } as const;
const short = { TruePositive: "TP", FalsePositive: "FP", FalseNegative: "FN", TrueNegative: "TN", VisibilityGap: "Gap" } as const;
const percent = (value: number | null) => value === null ? "N/A" : `${(value * 100).toFixed(1)}%`;
const delta = (value: number | null) => value === null ? "N/A" : `${value > 0 ? "+" : ""}${value.toFixed(1)} pp`;
function Outcome({ value }: { value: ExperimentOutcome }) { return <Pill tone={tones[value]}>{value}</Pill>; }

function Experiments() {
  const query = useExperiments();
  const tuning = useTuningChanges();
  const session = query.data ? selectExperimentSession(query.data.snapshot, query.data.source) : undefined;
  const data = session?.snapshot;
  const before = data?.runs.find((r) => r.id === data.tuningLink.beforeRunId);
  const after = data?.runs.find((r) => r.id === data.tuningLink.afterRunId);
  const repeat = data?.comparisons.filter((c) => c.purpose === "Repeatability") ?? [];
  const tuningComparison = data?.comparisons.find((c) => c.purpose === "BeforeAfterTuning" && c.runAId === before?.id && c.runBId === after?.id);
  return <div className="space-y-6">
    <ExampleDataBanner show={DATA_SOURCE !== "mock" && !!session?.example} />
    <PageHeader title="Experiments" right={session?.example ? <Pill tone="warning">Example data</Pill> : data?.runs.length ? <Pill tone="muted">Recorded runs</Pill> : undefined} />
    {query.isLoading ? <RowsSkeleton /> : query.isError ? <EmptyState icon={<ShieldAlert />} title="Experiments unavailable" hint={query.error.message} /> : !data?.runs.length ? <EmptyState icon={<FlaskConical />} title="No runs recorded yet" /> : <>
      <section aria-labelledby="session-title">
        <h2 id="session-title" className="mb-3 text-base font-semibold">Session script</h2>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-xs text-muted-foreground">{["Order", "Scenario", "Kind", "MITRE", "Description"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead><tbody>{data.scenarios.map((s, i) => <tr key={s.id} className="border-b border-border/60"><td className="px-3 py-3 font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</td><td className="px-3 py-3 font-medium">{s.name}</td><td className="px-3 py-3"><Pill tone={s.kind === "Attack" ? "critical" : "success"}>{s.kind}</Pill></td><td className="px-3 py-3"><Mono className="text-primary">{s.technique ?? "—"}</Mono></td><td className="min-w-48 px-3 py-3 text-xs text-muted-foreground">{s.description}</td></tr>)}</tbody></table></div>
      </section>
      <section aria-labelledby="legend-title" className="border-y border-border py-4"><h2 id="legend-title" className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Outcome legend</h2><dl className="grid gap-x-6 gap-y-3 md:grid-cols-2">{OUTCOMES.map((o) => <div key={o} className="flex flex-wrap items-center gap-2 text-xs"><dt><Outcome value={o} /></dt><dd className="text-muted-foreground">= {OUTCOME_LEGEND[o]}</dd></div>)}</dl></section>
      <section aria-labelledby="repeat-title"><h2 id="repeat-title" className="mb-3 text-base font-semibold">Repeatability</h2>{repeat.length ? repeat.map((c) => {
        const a = data.runs.find((r) => r.id === c.runAId); const b = data.runs.find((r) => r.id === c.runBId);
        return a && b ? <Repeatability key={c.id} data={data} a={a} b={b} comparison={c} /> : null;
      }) : <p className="text-sm text-muted-foreground">No repeatability comparison recorded.</p>}</section>
      <section aria-labelledby="tuning-title"><h2 id="tuning-title" className="mb-3 text-base font-semibold">Before vs after tuning</h2>{before && after ? <TuningComparison before={before} after={after} /> : <p className="text-sm text-muted-foreground">No before-and-after tuning comparison recorded.</p>}
        {tuningComparison && tuningComparison.explanations.length > 0 && <ul className="mt-4 space-y-2 text-xs text-muted-foreground">{tuningComparison.explanations.map((e, i) => <li key={`${e.scenarioId}-${i}`}><span className="font-medium text-foreground">{data.scenarios.find((s) => s.id === e.scenarioId)?.name ?? e.scenarioId}</span> · {e.text}</li>)}</ul>}
        {!!data.tuningLink.changeIds.length && <div className="mt-5 border-t border-border pt-4"><h3 className="mb-2 text-sm font-semibold">Linked logging changes</h3>{tuning.isError && <p className="text-xs text-critical">Logging change details unavailable.</p>}<ul className="space-y-2">{data.tuningLink.changeIds.map((id) => {
          const change = tuning.data?.find((c) => c.id === id);
          return <li key={id}><Link to="/tuning" className="inline-flex items-start gap-2 text-sm text-primary hover:underline"><ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0" /><span><Mono>{id}</Mono> · {change?.visibilityGap ?? (tuning.isLoading ? "Loading change…" : "Change not present in current snapshot")}</span></Link></li>;
        })}</ul></div>}
      </section>
    </>}
  </div>;
}

function Result({ result }: { result: ExperimentResult | undefined }) {
  const actions = useActions();
  const action = actions.data?.find((a) => a.detectionId === result?.detectionId);
  if (!result) return <span className="text-xs text-muted-foreground">Not recorded</span>;
  const status = result.actionStatus;
  return <div className="space-y-1.5"><Outcome value={result.outcome} /><div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">Action: <span className="text-foreground">{status ?? "None"}</span>{(status === "AutoExecuted" || status === "Approved" || status === "Responded") && <ResponseEffectBadge status={status} mode={action?.mode} />}</div>{result.detectionId && <div className="break-all"><Mono>{result.detectionId}</Mono>{result.verdict && <span className="text-xs text-muted-foreground"> · {result.verdict}</span>}</div>}{result.notes && <p className="max-w-sm text-xs text-muted-foreground">{result.notes}</p>}</div>;
}
function Repeatability({ data, a, b, comparison }: { data: ExperimentSnapshot; a: ExperimentRun; b: ExperimentRun; comparison: ExperimentComparison }) {
  const metrics = compareRuns(data, a, b);
  return <div className="mb-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">{a.label} vs {b.label}</h3><span className="text-sm tabular-nums">identical outcomes: <span className="text-primary">{metrics.identical} of {metrics.total} ({percent(metrics.ratio)})</span></span></div>
    {!metrics.differences && <p className="mb-3 text-sm text-success">No differences in outcomes or action statuses.</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-3 py-2 font-medium">Scenario</th>{[a, b].map((r) => <th key={r.id} className="min-w-52 px-3 py-2 font-medium"><span className="block text-foreground">{r.label} · {r.configLabel}</span><span>{new Date(r.startedAt).toLocaleString()}</span></th>)}<th className="min-w-48 px-3 py-2 font-medium">Difference / explanation</th></tr></thead><tbody>{metrics.rows.map((row) => <tr key={row.scenario.id} className={cn("border-b border-border/60 align-top", row.differs && "bg-warning/10")}><td className="px-3 py-3 font-medium">{row.scenario.name}</td><td className="px-3 py-3"><Result result={row.resultA} /></td><td className="px-3 py-3"><Result result={row.resultB} /></td><td className="px-3 py-3 text-xs"><span className={row.differs ? "text-warning" : "text-muted-foreground"}>{row.differs ? comparison.explanations.filter((e) => e.scenarioId === row.scenario.id).map((e) => e.text).join(" · ") || "Difference recorded; no explanation supplied." : "Identical"}</span></td></tr>)}</tbody></table></div>
  </div>;
}
function TuningComparison({ before, after }: { before: ExperimentRun; after: ExperimentRun }) {
  const a = runMetrics(before); const b = runMetrics(after);
  const chart = (["TruePositive", "FalsePositive", "FalseNegative", "VisibilityGap"] as const).map((o) => ({ outcome: short[o], before: a.counts[o], after: b.counts[o] }));
  return <div><p className="mb-3 text-xs text-muted-foreground">{before.label} · {before.configLabel} → {after.label} · {after.configLabel}</p>
    <div className="grid gap-5 lg:grid-cols-5"><Panel title="Scenario outcomes" className="lg:col-span-3"><div className="flex flex-wrap gap-4 px-4 pt-3 text-xs"><span className="text-muted-foreground">■ {before.configLabel} · {before.label}</span><span className="text-primary">■ {after.configLabel} · {after.label}</span></div><div className="h-64 px-2 py-3" role="img" aria-label="Grouped scenario outcome counts before and after tuning"><ResponsiveContainer><BarChart data={chart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="outcome" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={28} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--foreground)", fontSize: 12 }} /><Bar dataKey="before" name={`${before.configLabel} · ${before.label}`} fill="var(--muted-foreground)" maxBarSize={32} isAnimationActive={false} /><Bar dataKey="after" name={`${after.configLabel} · ${after.label}`} fill="var(--primary)" maxBarSize={32} isAnimationActive={false} /></BarChart></ResponsiveContainer></div></Panel>
      <div className="overflow-x-auto lg:col-span-2"><table className="w-full text-xs"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-3 pr-2 font-medium">Metric</th><th className="px-2 font-medium">{before.configLabel}</th><th className="px-2 font-medium">{after.configLabel}</th><th className="pl-2 font-medium">Change</th></tr></thead><tbody>{[{ name: "Detection rate", a: a.detectionRate, b: b.detectionRate, formula: "TP / (TP + FN + VisibilityGap)" }, { name: "Precision", a: a.precision, b: b.precision, formula: "TP / (TP + FP)" }].map((m) => <tr key={m.name} className="border-b border-border/60"><td className="py-4 pr-2"><span className="block font-medium">{m.name}</span><span className="mt-1 block text-muted-foreground">{m.formula}</span></td><td className="px-2 tabular-nums">{percent(m.a)}</td><td className="px-2 tabular-nums text-primary">{percent(m.b)}</td><td className="pl-2 whitespace-nowrap tabular-nums">{delta(rateChange(m.a, m.b))}</td></tr>)}{chart.map((r) => <tr key={r.outcome} className="border-b border-border/60"><td className="py-2">{r.outcome} count</td><td className="px-2 tabular-nums">{r.before}</td><td className="px-2 tabular-nums">{r.after}</td><td className="pl-2 tabular-nums">{r.after - r.before > 0 ? "+" : ""}{r.after - r.before}</td></tr>)}</tbody></table></div>
    </div>
  </div>;
}