import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock, ShieldOff, ShieldCheck } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel, PageHeader, RowsSkeleton, ago, Mono, EmptyState } from "@/components/console/common";
import { Pill, SourceBadge } from "@/components/console/badges";
import { useBlockedAttempts, useGuardrails, useUpdateGuardrails } from "@/data/queries";
import { MAX_AUTO_THRESHOLD, THRESHOLD_LABELS } from "@/data/guardrails";

export const Route = createFileRoute("/guardrails")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Guardrails — Grim Reaper" },
      { name: "description", content: "Protected allowlist, approval thresholds and dry-run controls for the AI agent." },
      { property: "og:title", content: "Guardrails — Grim Reaper" },
      { property: "og:description", content: "Hard limits on what the AI response agent is allowed to do." },
    ],
  }),
  component: Guardrails,
});

function Guardrails() {
  const { data: cfg, isLoading } = useGuardrails();
  const blocked = useBlockedAttempts();
  const update = useUpdateGuardrails();
  const [threshold, setThreshold] = useState(1);
  useEffect(() => { if (cfg) setThreshold(cfg.approvalThreshold); }, [cfg?.approvalThreshold]);

  return (
    <div>
      <PageHeader title="Guardrails" subtitle="Hard limits the AI agent cannot override — enforced before any action reaches an endpoint." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Approval threshold">
          {isLoading || !cfg ? <div className="p-4"><Skeleton className="h-20 bg-muted" /></div> : (
            <div className="p-4">
              <p className="text-sm text-muted-foreground">Actions with risk <span className="text-foreground">above</span> this level always wait for a human. Critical-risk actions can never auto-execute.</p>
              <div className="mt-5 flex items-baseline justify-between">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Auto-execute up to</span>
                <span className="font-display text-lg font-semibold text-primary">{THRESHOLD_LABELS[threshold]}</span>
              </div>
              <Slider className="mt-3" min={0} max={MAX_AUTO_THRESHOLD} step={1} value={[threshold]}
                onValueChange={([v]) => setThreshold(v ?? 0)} onValueCommit={([v]) => update.mutate({ approvalThreshold: v ?? 0 })} />
              <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>None</span><span>Low</span><span>Medium</span><span>High</span></div>
            </div>
          )}
        </Panel>
        <Panel title="Global dry run">
          {isLoading || !cfg ? <div className="p-4"><Skeleton className="h-20 bg-muted" /></div> : (
            <div className="flex items-start justify-between gap-4 p-4">
              <p className="text-sm text-muted-foreground">When on, every approved or auto-executed action is simulated and logged — no changes are made on any endpoint.</p>
              <div className="flex flex-col items-end gap-2">
                <Switch checked={cfg.globalDryRun} disabled={update.isPending} onCheckedChange={(v) => update.mutate({ globalDryRun: v })} />
                {cfg.globalDryRun ? <Pill tone="warning">ON</Pill> : <Pill tone="muted">OFF</Pill>}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel className="mt-4" title="Protected allowlist" right={<span className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" />Locked · managed by policy</span>}>
        {isLoading || !cfg ? <RowsSkeleton rows={6} /> : (
          <ul className="grid sm:grid-cols-2">
            {cfg.protectedList.map((p) => (
              <li key={p.name} className="flex items-start gap-3 border-b border-border/60 px-4 py-3 sm:odd:border-r">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><Mono className="text-foreground">{p.name}</Mono><Pill tone="muted">{p.kind}</Pill></div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{p.reason}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="mt-4" title="Blocked by guardrail">
        {blocked.isLoading ? <RowsSkeleton rows={3} /> : !blocked.data?.length ? (
          <EmptyState icon={<ShieldCheck />} title="No blocked attempts" hint="When the agent or an analyst targets a protected resource, it shows up here." />
        ) : (
          <ul>
            {blocked.data.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0">
                <ShieldOff className="h-4 w-4 text-critical" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm"><span className="font-medium">{b.actionType}</span> → <Mono className="text-critical">{b.target}</Mono></div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Mono>{b.hostname}</Mono><SourceBadge source={b.source} hostname={b.hostname} />· requested by <Mono>{b.requestedBy}</Mono> · {ago(b.at)}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{b.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
