import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, BrainCircuit, Cable, CheckCircle2, Cpu, Filter, RotateCcw, ShieldCheck, Zap } from "lucide-react";
import { PageHeader, RowsSkeleton } from "@/components/console/common";
import { Pill } from "@/components/console/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useEndpoints, useFleetStats } from "@/data/queries";
import { DATA_SOURCE } from "@/data/config";
import { ASSUMPTION_LABEL, calculatePitch, pitchAssumptions, pitchFields, pitchPeriod, updatePitch, type PitchKey } from "@/data/pitchAssumptions";

export const Route = createFileRoute("/scale-cost")({
  head: () => ({ meta: [
    { title: "Scale & Cost — Grim Reaper" },
    { name: "description", content: "Assumption-based endpoint pipeline, AI triage cost calculator and reported lab telemetry." },
    { property: "og:title", content: "Scale & Cost — Grim Reaper" },
    { property: "og:description", content: "Explore hypothetical fleet workloads and AI costs separately from lab results and demonstrated limits." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ScaleCost,
});

const stages = [
  { name: "Endpoint agent", detail: "Collect, normalise Windows telemetry", location: "On endpoint", icon: Cpu },
  { name: "Ingest", detail: "Receive and route event batches", location: "Central", icon: Cable },
  { name: "Deterministic rules and baselines", detail: "Select matches and behavioral deviations", location: "Central", icon: Filter },
  { name: "AI triage (candidates only)", detail: "Assess selected evidence, not the event stream", location: "Central", icon: BrainCircuit },
  { name: "Guardrails", detail: "Check evidence, protected targets and risk", location: "Central", icon: ShieldCheck },
  { name: "Response", detail: "Execute permitted actions on the endpoint", location: "On endpoint", icon: Zap },
] as const;
const number = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });
const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const funnelColors = { muted: "bg-muted-foreground", info: "bg-info", primary: "bg-primary", critical: "bg-critical" } as const;

function ScaleCost() {
  const [inputs, setInputs] = useState({ ...pitchAssumptions });
  const result = calculatePitch(inputs);
  const stats = useFleetStats();
  const endpoints = useEndpoints();
  const simulated = endpoints.data?.filter((e) => e.source === "simulated").length;
  const funnel = [
    { label: "Events per day across the fleet", value: result.events, tone: "muted" },
    { label: "Rule matches or baseline deviations", value: result.matches, tone: "info" },
    { label: "Candidates sent to AI triage", value: result.candidates, tone: "primary" },
    { label: "Malicious verdicts", value: result.malicious, tone: "critical" },
  ] as const;
  const outputs = [
    { label: "AI triage calls / day", value: number(result.calls) },
    { label: "Daily AI cost", value: money(result.dailyCost) },
    { label: "Monthly AI cost", value: money(result.monthlyCost) },
    { label: "Cost / endpoint / month", value: money(result.perEndpoint) },
    { label: "Analyst hours saved / month", value: number(result.analystHours) },
  ];
  const change = (key: PitchKey, value: number) => setInputs((current) => updatePitch(current, key, value));
  return <div className="space-y-7">
    <PageHeader title="Scale & Cost" right={<Pill tone="warning">Hypothetical estimates · not measured</Pill>} />
    <section aria-labelledby="pipeline-title" className="border-y border-border py-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 id="pipeline-title" className="text-base font-semibold">Defense pipeline</h2><span className="text-xs text-primary">Only selected candidates reach AI triage</span></div>
      <div className="overflow-x-auto pb-2"><ol className="grid min-w-[960px] grid-cols-6 gap-4">{stages.map(({ name, detail, location, icon: Icon }, i) => <li key={name} className="relative pr-3">
        <div className="mb-3 flex items-center justify-between"><Icon className="h-5 w-5 text-primary" />{i < stages.length - 1 && <ArrowRight aria-hidden className="h-4 w-4 text-muted-foreground" />}</div>
        <h3 className="min-h-10 text-sm font-medium">{name}</h3><p className="mt-2 min-h-10 text-xs text-muted-foreground">{detail}</p><div className="mt-3"><Pill tone={location === "On endpoint" ? "info" : "muted"}>{location}</Pill></div>
      </li>)}</ol></div>
      <p className="mt-3 text-xs text-muted-foreground">Target architecture: only a small fraction of events reach AI triage. Current assumption: {number(inputs.candidatePercent)}% of events; fleet capacity is not demonstrated.</p>
    </section>

    <section aria-labelledby="funnel-title"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 id="funnel-title" className="text-base font-semibold">Daily fleet funnel</h2><Pill tone="warning">Calculated assumptions</Pill></div>
      <div className="grid gap-0 border-y border-border md:grid-cols-5">{funnel.map((step) => <div key={step.label} className="min-w-0 border-b border-border px-3 py-4 md:border-r md:border-b-0"><div className={`mb-2 h-1 w-8 rounded ${funnelColors[step.tone]}`} /><div className="font-mono text-xl text-foreground">{number(step.value)}</div><div className="mt-2 text-xs text-muted-foreground">{step.label}</div></div>)}
        <div className="px-3 py-4"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="font-mono text-lg text-success">{number(result.auto)} <span className="font-sans text-xs">auto</span></span><span className="font-mono text-lg text-warning">{number(result.human)} <span className="font-sans text-xs">human</span></span></div><div className="mt-2 text-xs text-muted-foreground">Actions auto-executed vs human-approved</div></div>
      </div><p className="mt-2 text-xs text-muted-foreground">Expected daily volumes may be fractional. Verdict and response conversion rates are editable assumptions, not observed results.</p>
    </section>

    <section aria-labelledby="calculator-title"><div className="mb-4 flex items-center justify-between gap-3"><h2 id="calculator-title" className="text-base font-semibold">Cost calculator</h2><Button variant="ghost" size="sm" onClick={() => setInputs({ ...pitchAssumptions })}><RotateCcw className="h-3.5 w-3.5" />Reset assumptions</Button></div>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">{(Object.keys(pitchFields) as PitchKey[]).map((key) => {
          const field = pitchFields[key];
          return <div key={key} className="min-w-0"><label htmlFor={`pitch-${key}`} className="block text-sm font-medium">{field.label}</label><p className="mt-1 text-[11px] text-warning">{ASSUMPTION_LABEL}</p><div className="my-2 flex items-center gap-3"><Input id={`pitch-${key}`} type="number" min={field.min} max={key === "candidatePercent" ? inputs.ruleMatchPercent : field.max} step={field.step} value={inputs[key]} onChange={(e) => { if (e.target.value !== "") change(key, e.target.valueAsNumber); }} className="h-8 w-32 shrink-0 font-mono text-xs" /><span className="text-[11px] text-muted-foreground">{field.unit}</span></div><Slider aria-label={field.label} min={field.min} max={key === "candidatePercent" ? Math.max(field.step, inputs.ruleMatchPercent) : field.max} step={field.step} value={[inputs[key]]} onValueChange={(v) => { const value = v[0]; if (value !== undefined) change(key, value); }} />{key === "candidatePercent" && <p className="mt-2 text-[11px] text-muted-foreground">Subset of rule matches / deviations; capped at their percentage.</p>}</div>;
        })}</div>
        <div className="min-w-0 border-t border-border pt-4 xl:border-t-0 xl:border-l xl:pl-6 xl:pt-0"><h3 className="text-sm font-semibold">Estimated AI economics</h3><dl className="mt-3 divide-y divide-border">{outputs.map((output) => <div key={output.label} className="py-4"><dt className="text-xs text-muted-foreground">{output.label}</dt><dd className="mt-1 break-words font-mono text-2xl text-primary" data-testid={output.label}>{output.value}</dd></div>)}</dl><p className="mt-4 text-xs leading-relaxed text-warning">{pitchPeriod.daysPerMonth}-day month · {ASSUMPTION_LABEL}</p><p className="mt-3 text-xs leading-relaxed text-muted-foreground">USD token costs only, before any provider discounts or funding. Excludes ingestion, compute, storage, network, endpoint operations and analyst costs. Hours saved assumes every triaged candidate saves the entered time; quality and time savings are unverified.</p></div>
      </div>
    </section>

    <section aria-labelledby="lab-title" className="border-y border-border py-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 id="lab-title" className="text-base font-semibold">Measured on our lab VM</h2>{!stats.isError && <Pill tone={DATA_SOURCE === "file" ? "success" : "warning"}>{DATA_SOURCE === "file" ? <><CheckCircle2 className="h-3 w-3" />measured</> : "example"}</Pill>}</div>
      {stats.isLoading ? <RowsSkeleton rows={2} /> : stats.isError ? <p className="text-sm text-critical">Lab figures unavailable: {stats.error.message}</p> : stats.data && <dl className="grid grid-cols-2 gap-5 md:grid-cols-4">{[
        ["eventsProcessed", stats.data.eventsProcessed], ["eventsPerSecond", stats.data.eventsPerSecond], ["detections", stats.data.detections24h], ["actions", stats.data.actions ?? stats.data.actionsAuto + stats.data.actionsHuman],
      ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-mono text-xl">{number(Number(value))}</dd></div>)}</dl>}
      <p className="mt-3 text-xs text-muted-foreground">{DATA_SOURCE === "file" ? "Reported by stats.json; recording window and lab attribution are supplied by the producer, not independently verified here." : "Example figures from the mock feed, not lab measurements."} These totals do not measure fleet capacity or validate calculator assumptions.</p>
    </section>

    <section aria-labelledby="limits-title" className="rounded-md border border-warning/30 bg-warning/5 p-4"><h2 id="limits-title" className="mb-2 flex items-center gap-2 text-sm font-semibold text-warning"><ShieldCheck className="h-4 w-4" />Honest limits</h2>{endpoints.isError ? <p className="text-sm text-critical">Host count unavailable: {endpoints.error.message}</p> : simulated === undefined ? <p className="text-sm text-muted-foreground">Loading host count…</p> : <p className="text-sm leading-relaxed">Demonstrated: 1 live endpoint plus replayed telemetry from {number(simulated)} hosts. Not yet demonstrated: fleet-scale ingestion, agent updates, multi-tenant isolation.</p>}<p className="mt-2 text-xs text-muted-foreground">{DATA_SOURCE === "mock" ? "Pitch statement only: mock mode contains example hosts and is not evidence of a live endpoint or replay." : "Simulated host count comes from endpoints.json; replay execution and the demonstration claim are not verified by that count."}</p></section>
  </div>;
}