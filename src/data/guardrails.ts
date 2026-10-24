import type { ActionStatus, GuardrailConfig, ProposedAction, ProtectedEntry, RiskLevel, TuningChange, TuningStatus } from "./types";

export const RISK_RANK: Record<RiskLevel, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };
export const MAX_AUTO_THRESHOLD = 3; // Critical can never auto-execute

export const DEFAULT_PROTECTED: ProtectedEntry[] = [
  { name: "lsass.exe", kind: "process", reason: "Local Security Authority — killing it forces a reboot" },
  { name: "csrss.exe", kind: "process", reason: "Client/Server Runtime — critical system process" },
  { name: "wininit.exe", kind: "process", reason: "Windows init — termination causes BSOD" },
  { name: "services.exe", kind: "process", reason: "Service Control Manager" },
  { name: "smss.exe", kind: "process", reason: "Session Manager Subsystem" },
  { name: "winlogon.exe", kind: "process", reason: "Interactive logon handler" },
  { name: "GrimReaperAgent", kind: "service", reason: "Our own agent — must never disable itself" },
  { name: "mgmt.grimreaper.io:8443", kind: "channel", reason: "Management channel — blocking it orphans the endpoint" },
];

export function isProtectedTarget(target: string, list: ProtectedEntry[]): ProtectedEntry | undefined {
  const t = target.trim().toLowerCase();
  return list.find((p) => {
    const n = p.name.toLowerCase();
    if (t === n || t.endsWith("\\" + n) || t.startsWith(n + " ")) return true;
    if (p.kind === "channel") {
      const host = n.split(":")[0];
      return t === host || t.startsWith(host + ":") || t.startsWith(host + "/");
    }
    return false;
  });
}

export function requiresApproval(risk: RiskLevel, threshold: number): boolean {
  const effective = Math.min(Math.max(threshold, 0), MAX_AUTO_THRESHOLD);
  return RISK_RANK[risk] > effective;
}

export function decideInitialStatus(
  action: ProposedAction,
  evidenceVerified: boolean,
  cfg: GuardrailConfig,
): { status: ActionStatus; reason: string } {
  const hit = isProtectedTarget(action.target, cfg.protectedList);
  if (hit) return { status: "BlockedByGuardrail", reason: `Target "${hit.name}" is on the protected allowlist` };
  if (!evidenceVerified) return { status: "PendingApproval", reason: "Evidence not verified in log store" };
  if (requiresApproval(action.riskLevel, cfg.approvalThreshold))
    return { status: "PendingApproval", reason: `${action.riskLevel} risk is above the auto-execute threshold` };
  return { status: "AutoExecuted", reason: "Within auto-execute threshold" };
}

export function canExecute(evidenceVerified: boolean): boolean {
  return evidenceVerified;
}

export const THRESHOLD_LABELS = ["Nothing (all require approval)", "Low", "Medium", "High"];

export function tuningProtectionViolation(change: TuningChange): boolean {
  const { before, after } = change.proposedChange;
  return (before.managementChannel && !after.managementChannel) || (before.agentService && !after.agentService);
}

export function safeTuningStatus(change: TuningChange): TuningStatus {
  if (tuningProtectionViolation(change)) return "RolledBack";
  if (change.validationResult && (!change.validationResult.configAccepted || !change.validationResult.serviceRunning)) return "RolledBack";
  if (change.status === "Applied" && !change.validationResult) return "Proposed";
  if (change.status === "Validated" && !change.validationResult) return "Proposed";
  return change.status;
}

export function visibleTestedTechniques(changes: TuningChange[], tested: string[], hostId: string) {
  const visible = new Set(changes.filter((c) => c.hostId === hostId && safeTuningStatus(c) === "Applied").flatMap((c) => c.techniquesNowVisible));
  const uniqueTested = [...new Set(tested)];
  return { visible: uniqueTested.filter((id) => visible.has(id)).length, tested: uniqueTested.length };
}
