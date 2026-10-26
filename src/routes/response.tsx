import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Ban, FileLock2, Globe, History, Inbox, Power, RotateCcw, Skull, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Panel, PageHeader, RowsSkeleton, ago, Mono, EmptyState } from "@/components/console/common";
import { ActionStatusBadge, Pill, RiskBadge, SourceBadge } from "@/components/console/badges";
import { useActions, useApprove, useGuardrails, useReject, useRollback, useSetMode } from "@/data/queries";
import type { Action, ActionType } from "@/data/types";
import { canApproveAction, THRESHOLD_LABELS } from "@/data/guardrails";
import { DATA_SOURCE } from "@/data/config";

export const Route = createFileRoute("/response")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Response Center — Grim Reaper" },
      { name: "description", content: "Human-in-the-loop approval queue for guardrailed response actions." },
      { property: "og:title", content: "Response Center — Grim Reaper" },
      { property: "og:description", content: "Approve, reject or roll back response actions with a full audit trail." },
    ],
  }),
  component: ResponseCenter,
});

const ICON: Record<ActionType, typeof Ban> = {
  BlockDestination: Ban,
  KillProcess: Skull,
  QuarantineFile: FileLock2,
  DisableService: Power,
  BlockDomain: Globe,
};

const TABS = {
  pending: (a: Action) => a.status === "PendingApproval",
  executed: (a: Action) => a.status === "AutoExecuted" || a.status === "Approved",
  blocked: (a: Action) => a.status === "BlockedByGuardrail",
  closed: (a: Action) => a.status === "Rejected" || a.status === "RolledBack",
};
type Tab = keyof typeof TABS;

function ResponseCenter() {
  const { data, isLoading } = useActions();
  const { data: cfg } = useGuardrails();
  const [tab, setTab] = useState<Tab>("pending");
  const [audit, setAudit] = useState<Action | null>(null);
  const counts = useMemo(() => Object.fromEntries(Object.entries(TABS).map(([k, f]) => [k, (data ?? []).filter(f).length])), [data]);
  const list = (data ?? []).filter(TABS[tab]).slice(0, 80);
  const auditLive = audit ? data?.find((a) => a.id === audit.id) ?? audit : null;

  return (
    <div>
      <PageHeader
        title="Response Center"
        subtitle="Only the five fixed action types can run. No free-text commands."
        right={cfg && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Pill tone="primary">Auto-execute up to: {THRESHOLD_LABELS[cfg.approvalThreshold]}</Pill>
            {cfg.globalDryRun && <Pill tone="warning">Global dry run ON</Pill>}
          </div>
        )}
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mb-4">
        <TabsList className="bg-card">
          <TabsTrigger value="pending">Pending ({counts["pending"] ?? 0})</TabsTrigger>
          <TabsTrigger value="executed">Executed ({counts["executed"] ?? 0})</TabsTrigger>
          <TabsTrigger value="blocked">Blocked ({counts["blocked"] ?? 0})</TabsTrigger>
          <TabsTrigger value="closed">Closed ({counts["closed"] ?? 0})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Panel>
        {isLoading ? <RowsSkeleton rows={8} /> : !list.length ? (
          <EmptyState icon={<Inbox />} title={tab === "pending" ? "No pending approvals" : "Nothing here yet"} hint={tab === "pending" ? "The queue is clear. New actions above the threshold will appear here." : undefined} />
        ) : (
          <ul>{list.map((a) => <ActionRow key={a.id} a={a} globalDryRun={!!cfg?.globalDryRun} onAudit={() => setAudit(a)} />)}</ul>
        )}
      </Panel>

      <Sheet open={!!audit} onOpenChange={(o) => !o && setAudit(null)}>
        <SheetContent className="w-full border-border bg-card sm:max-w-md">
          <SheetHeader><SheetTitle className="flex items-center gap-2"><History className="h-4 w-4" />Audit trail · <Mono>{auditLive?.id}</Mono></SheetTitle></SheetHeader>
          {auditLive && (
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2"><span>{auditLive.type}</span><ActionStatusBadge s={auditLive.status} /></div>
              <Mono className="block break-all">{auditLive.target}</Mono>
              {auditLive.blockedReason && <div className="text-critical"><span className="font-semibold">Blocked reason: </span>{auditLive.blockedReason}</div>}
            </div>
           )}
           {auditLive && (
            <ol className="mt-6 space-y-4 border-l border-border pl-4">
              {auditLive.auditLog.map((e, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                  <div className="text-sm font-medium">{e.event}</div>
                  <div className="text-xs text-muted-foreground"><Mono>{e.actor}</Mono> · {new Date(e.at).toLocaleString()}</div>
                  {e.detail && <div className="mt-1 text-xs text-foreground/80">{e.detail}</div>}
                </li>
              ))}
            </ol>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ActionRow({ a, globalDryRun, onAudit }: { a: Action; globalDryRun: boolean; onAudit: () => void }) {
  const approve = useApprove();
  const reject = useReject();
  const rollback = useRollback();
  const setMode = useSetMode();
  const Icon = ICON[a.type];
  const busy = approve.isPending || reject.isPending || rollback.isPending;
  const pending = a.status === "PendingApproval";
  const dry = globalDryRun || a.mode === "DryRun";

  return (
    <li className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 last:border-0 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent text-primary"><Icon className="h-4 w-4" /></div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{a.type}</span>
            <RiskBadge r={a.riskLevel} />
            <ActionStatusBadge s={a.status} />
            {a.mode === "DryRun" && !pending && <Pill tone="muted">Dry run</Pill>}
          </div>
          <Mono className="mt-1 block break-all text-foreground/85">{a.target}</Mono>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Mono>{a.id}</Mono>·<Mono>{a.hostname}</Mono><SourceBadge source={a.source} hostname={a.hostname} />· from <Mono>{a.detectionId}</Mono> · {ago(a.createdAt)}
          </div>
          {pending && !a.evidenceVerified && (
            <div className="mt-1.5 flex items-center gap-1 text-xs text-critical"><AlertTriangle className="h-3 w-3" />Evidence unverified — cannot execute</div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {pending && (
          <>
            <label className="mr-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={dry} disabled={DATA_SOURCE === "file" || (DATA_SOURCE === "hybrid" && a.source === "live") || globalDryRun || setMode.isPending} onCheckedChange={(v) => setMode.mutate({ id: a.id, mode: v ? "DryRun" : "Live" })} />
              Dry run
            </label>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => reject.mutate(a.id)}>Reject</Button>
            <Button size="sm" disabled={busy || !canApproveAction(a)} onClick={() => approve.mutate(a.id)}>Approve</Button>
          </>
        )}
        {(a.status === "AutoExecuted" || a.status === "Approved") && (
          <Button size="sm" variant="outline" disabled={!a.rollbackAvailable || busy} onClick={() => rollback.mutate(a.id)}
            title={a.rollbackAvailable ? "Restore original state" : "Not reversible (dry run or process termination)"}>
            <Undo2 className="h-3.5 w-3.5" />Rollback
          </Button>
        )}
        {a.status === "RolledBack" && <RotateCcw className="h-4 w-4 text-info" />}
        <Button size="sm" variant="ghost" onClick={onAudit}><History className="h-3.5 w-3.5" />Audit</Button>
      </div>
    </li>
  );
}
