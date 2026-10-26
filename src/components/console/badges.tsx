import { cn } from "@/lib/utils";
import type { ActionMode, ActionStatus, DataOrigin, ProtectionState, RiskLevel, Severity, Verdict } from "@/data/types";
import { responseEffect } from "@/data/honesty";
import type { ReactNode } from "react";
import { useSourceStatus } from "./SourceStatus";

type Tone = "critical" | "warning" | "success" | "info" | "muted" | "primary";
const TONE: Record<Tone, string> = {
  critical: "bg-critical/15 text-critical border-critical/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  success: "bg-success/15 text-success border-success/30",
  info: "bg-info/15 text-info border-info/30",
  muted: "bg-muted text-muted-foreground border-border",
  primary: "bg-primary/15 text-primary border-primary/30",
};

export function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium", TONE[tone], className)}>
      {children}
    </span>
  );
}

export function SourceBadge({ source, hostname }: { source: DataOrigin; hostname?: string | undefined }) {
  const { liveHosts } = useSourceStatus();
  if (source === "live" && hostname && liveHosts.includes(hostname))
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-critical/40 bg-critical/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-critical">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-critical animate-live" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-critical" />
        </span>
        LIVE
      </span>
    );
  return <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground/80">{source === "live" ? "Demo host" : "Simulated"}</span>;
}

const SEV: Record<Severity, Tone> = { Critical: "critical", High: "critical", Medium: "warning", Low: "info" };
export const SeverityBadge = ({ s }: { s: Severity }) => <Pill tone={SEV[s]} className={s === "High" ? "opacity-80" : ""}>{s}</Pill>;

const RISK: Record<RiskLevel, Tone> = { Critical: "critical", High: "critical", Medium: "warning", Low: "success" };
export const RiskBadge = ({ r }: { r: RiskLevel }) => <Pill tone={RISK[r]}>{r} risk</Pill>;

const STATE: Record<ProtectionState, Tone> = { Protected: "success", Degraded: "warning", Isolated: "critical", Unmanaged: "muted" };
export const StateBadge = ({ s }: { s: ProtectionState }) => <Pill tone={STATE[s]}>{s}</Pill>;

const VERDICT: Record<Verdict, [Tone, string]> = {
  Malicious: ["critical", "Malicious"],
  Benign: ["success", "Benign"],
  NeedsMoreEvidence: ["warning", "Needs evidence"],
};
export const VerdictBadge = ({ v }: { v: Verdict }) => <Pill tone={VERDICT[v][0]}>{VERDICT[v][1]}</Pill>;

const AS: Record<ActionStatus, [Tone, string]> = {
  PendingApproval: ["warning", "Pending approval"],
  AutoExecuted: ["primary", "Auto-executed"],
  Approved: ["success", "Approved"],
  Rejected: ["muted", "Rejected"],
  BlockedByGuardrail: ["critical", "Blocked by guardrail"],
  RolledBack: ["info", "Rolled back"],
};
export function ResponseEffectBadge({ status, mode }: { status: ActionStatus | "Responded"; mode?: ActionMode | undefined }) {
  const effect = responseEffect(status, mode);
  return effect ? <Pill tone={effect === "executed" ? "success" : effect === "dry-run" ? "warning" : "muted"}>{effect === "dry-run" ? "DRY RUN — no change made" : effect === "executed" ? "EXECUTED" : "Response mode unconfirmed"}</Pill> : null;
}
export const ActionStatusBadge = ({ s, mode }: { s: ActionStatus; mode: ActionMode }) => <><Pill tone={AS[s][0]}>{AS[s][1]}</Pill><ResponseEffectBadge status={s} mode={mode} /></>;

export function ExampleDataBanner({ show }: { show: boolean }) {
  return show ? <div role="note" className="mb-4 border-y border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">Example data</div> : null;
}
