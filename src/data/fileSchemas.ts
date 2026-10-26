import { z } from "zod";

const origin = z.enum(["live", "simulated"]);
const risk = z.enum(["Low", "Medium", "High", "Critical"]);
const actionType = z.enum(["BlockDestination", "KillProcess", "QuarantineFile", "DisableService", "BlockDomain"]);
const timestamp = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative();
export const statsSchema = z.object({ eventsProcessed: count, eventsPerSecond: z.number().nonnegative(), detections: count, actions: count, actionsByStatus: z.object({ PendingApproval: count, AutoExecuted: count, Approved: count, Rejected: count, BlockedByGuardrail: count, RolledBack: count }).strict() }).strict();
const technique = z.object({ id: z.string(), name: z.string(), tactic: z.string() }).strict();
const proposedAction = z.object({ type: actionType, target: z.string(), riskLevel: risk }).strict().nullable();
export const endpointSchema = z.object({ id: z.string(), hostname: z.string(), user: z.string(), os: z.string(), department: z.string(), ip: z.string(), protectionState: z.enum(["Protected", "Degraded", "Isolated", "Unmanaged"]), lastSeen: timestamp, source: origin }).strict();
export const detectionSchema = z.object({ id: z.string(), endpointId: z.string(), hostname: z.string(), source: origin, timestamp, technique, rule: z.string(), severity: risk, confidence: z.number().min(0).max(1), verdict: z.enum(["Malicious", "Benign", "NeedsMoreEvidence"]), evidenceEventIds: z.array(z.string()), evidenceVerified: z.boolean(), reasoningSummary: z.string(), proposedAction, status: z.enum(["New", "Triaged", "Responded", "Dismissed"]), actionId: z.string().optional() }).strict();
export const actionSchema = z.object({ id: z.string(), detectionId: z.string(), endpointId: z.string(), hostname: z.string(), source: origin, type: actionType, target: z.string(), riskLevel: risk, mode: z.enum(["DryRun", "Live"]), status: z.enum(["PendingApproval", "AutoExecuted", "Approved", "Rejected", "BlockedByGuardrail", "RolledBack"]), rollbackAvailable: z.boolean(), evidenceVerified: z.boolean(), createdAt: timestamp, executedAt: timestamp.optional(), decidedBy: z.enum(["auto", "human"]).optional(), blockedReason: z.string().optional(), auditLog: z.array(z.object({ at: timestamp, actor: z.string(), event: z.string(), detail: z.string().optional() }).strict()) }).strict();
const logging = z.object({ networkConnections: z.boolean(), dnsQueries: z.boolean(), registryChanges: z.boolean(), powerShellScriptBlock: z.boolean(), managementChannel: z.boolean(), agentService: z.boolean() }).strict();
export const tuningSchema = z.object({ id: z.string(), timestamp, hostId: z.string(), source: origin, visibilityGap: z.string(), evidence: z.object({ observation: z.string(), eventIds: z.array(z.string()) }).strict(), proposedChange: z.object({ system: z.enum(["Sysmon", "AuditPolicy"]), before: logging, after: logging }).strict(), justification: z.string(), riskLevel: risk, status: z.enum(["Proposed", "Validated", "Applied", "RolledBack"]), validationResult: z.object({ configAccepted: z.boolean(), serviceRunning: z.boolean(), detail: z.string() }).strict().nullable(), rollbackSnapshotId: z.string(), techniquesNowVisible: z.array(z.string()) }).strict();
export const baselineSchema = z.object({
  source: origin.optional(),
  endpointId: z.string(), user: z.string(), status: z.enum(["Learning", "Active"]),
  learningWindow: z.object({ start: timestamp, end: timestamp, eventCount: count }).strict(),
  logonHours: z.array(count).length(24),
  usualProcesses: z.array(z.object({ name: z.string(), count, firstSeen: timestamp }).strict()),
  usualDestinations: z.array(z.object({ value: z.string(), type: z.enum(["domain", "ip"]), count }).strict()),
  deviations: z.array(z.object({ id: z.string(), timestamp, kind: z.enum(["LogonTime", "NewProcess", "NewDestination"]), subject: z.string(), score: z.number().min(0).max(1), reason: z.string(), evidenceEventIds: z.array(z.string()), evidenceVerified: z.boolean() }).strict()),
}).strict();
export const experimentSnapshotSchema = z.object({
  scenarios: z.array(z.object({ id: z.string().min(1), name: z.string(), kind: z.enum(["Attack", "Benign"]), technique: z.string().regex(/^T\d{4}(\.\d{3})?$/).nullable(), description: z.string() }).strict()),
  runs: z.array(z.object({ id: z.string().min(1), label: z.string(), startedAt: timestamp, configLabel: z.enum(["Weak baseline", "Tuned"]), results: z.array(z.object({ scenarioId: z.string(), outcome: z.enum(["TruePositive", "FalsePositive", "FalseNegative", "TrueNegative", "VisibilityGap"]), detectionId: z.string().nullable(), verdict: z.string().nullable(), actionStatus: z.string().nullable(), notes: z.string() }).strict()) }).strict()),
  comparisons: z.array(z.object({ id: z.string().min(1), runAId: z.string(), runBId: z.string(), purpose: z.enum(["Repeatability", "BeforeAfterTuning"]), explanations: z.array(z.object({ scenarioId: z.string(), text: z.string() }).strict()) }).strict()),
  tuningLink: z.object({ beforeRunId: z.string(), afterRunId: z.string(), changeIds: z.array(z.string()) }).strict(),
}).strict().superRefine((data, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  for (const [label, ids] of [["scenario", data.scenarios.map((s) => s.id)], ["run", data.runs.map((r) => r.id)], ["comparison", data.comparisons.map((c) => c.id)]] as const) {
    if (new Set(ids).size !== ids.length) issue(`Duplicate ${label} IDs`);
  }
  const scenarios = new Map(data.scenarios.map((s) => [s.id, s]));
  const runs = new Set(data.runs.map((r) => r.id));
  data.runs.forEach((run) => {
    if (new Set(run.results.map((r) => r.scenarioId)).size !== run.results.length) issue(`Duplicate scenario results in ${run.id}`);
    run.results.forEach((r) => {
      const s = scenarios.get(r.scenarioId);
      if (!s) issue(`Unknown scenario ${r.scenarioId}`);
      else if (s.kind === "Attack" ? ["FalsePositive", "TrueNegative"].includes(r.outcome) : ["TruePositive", "FalseNegative", "VisibilityGap"].includes(r.outcome)) issue(`Outcome inconsistent with scenario kind: ${r.scenarioId}`);
    });
  });
  data.comparisons.forEach((c) => {
    if (!runs.has(c.runAId) || !runs.has(c.runBId)) issue(`Unknown comparison run in ${c.id}`);
    c.explanations.forEach((e) => { if (!scenarios.has(e.scenarioId)) issue(`Unknown explanation scenario ${e.scenarioId}`); });
  });
  if (data.tuningLink.beforeRunId && !runs.has(data.tuningLink.beforeRunId)) issue("Unknown beforeRunId");
  if (data.tuningLink.afterRunId && !runs.has(data.tuningLink.afterRunId)) issue("Unknown afterRunId");
});