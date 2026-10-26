import { z } from "zod";
import type { DataSource } from "./DataSource";
import type { Action, ActionMode, Baseline, BlockedAttempt, Detection, Endpoint, ExperimentData, ExperimentSnapshot, FileStats, FleetStats, GuardrailConfig, Run, TuningChange } from "./types";
import { actionSchema, baselineSchema, detectionSchema, endpointSchema, experimentSnapshotSchema, statsSchema, tuningSchema } from "./fileSchemas";
import { canApproveAction, DEFAULT_PROTECTED, safeTuningStatus } from "./guardrails";

interface FileSnapshot { endpoints: Endpoint[]; detections: Detection[]; actions: Action[]; tuning: TuningChange[]; experiments: ExperimentSnapshot; baselines: Baseline[]; stats: FileStats }

/** Python-produced snapshots; decisions are commands to the console's same-origin service. */
export class FileDataSource implements DataSource {
  readonly kind = "file" as const;
  private pending: Promise<FileSnapshot> | undefined;
  private cached: FileSnapshot | undefined;
  private loadedAt = 0;
  constructor(private base = "/data", private fetcher: typeof fetch = (input, init) => fetch(input, init), private liveOnly = false) {}

  private async read<T>(file: string, schema: z.ZodType<T>): Promise<T[]> {
    return this.readValue(file, z.array(schema));
  }
  private async readValue<T>(file: string, schema: z.ZodType<T>): Promise<T> {
    const response = await this.fetcher(`${this.base.replace(/\/+$/, "")}/${file}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new Error(`${file}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    return parsed.data;
  }
  private snapshot(): Promise<FileSnapshot> {
    if (this.pending) return this.pending;
    if (this.cached && Date.now() - this.loadedAt < 1000) return Promise.resolve(this.cached);
    this.pending = Promise.all([
      this.read("endpoints.json", endpointSchema), this.read("detections.json", detectionSchema), this.read("actions.json", actionSchema), this.read("tuning_changes.json", tuningSchema), this.readValue("runs.json", experimentSnapshotSchema), this.read("baselines.json", baselineSchema),
      this.readValue("stats.json", statsSchema),
    ]).then(([endpoints, detections, actions, tuning, experiments, baselines, stats]) => {
      const result: FileSnapshot = {
        endpoints,
        detections: detections.map(({ actionId, ...d }) => ({ ...d, ...(actionId === undefined ? {} : { actionId }) })),
        actions: actions.map(({ executedAt, decidedBy, blockedReason, auditLog, ...a }) => ({ ...a,
          ...(executedAt === undefined ? {} : { executedAt }),
          ...(decidedBy === undefined ? {} : { decidedBy }),
          ...(blockedReason === undefined ? {} : { blockedReason }),
          auditLog: auditLog.map(({ detail, ...e }) => ({ ...e, ...(detail === undefined ? {} : { detail }) })),
        })),
        tuning: tuning.map((c) => ({ ...c, status: safeTuningStatus(c) })), experiments,
        baselines: baselines.map(({ source, ...b }) => ({ ...b, ...(source === undefined ? {} : { source }) })), stats,
      };
      this.cached = result;
      this.loadedAt = Date.now();
      return result;
    }).finally(() => { this.pending = undefined; });
    return this.pending;
  }
  async getEndpoints() { return structuredClone((await this.snapshot()).endpoints); }
  /** Hybrid uses only the three live-record feeds; lab aggregates are isolated. */
  async getLiveSnapshot() {
    const [endpoints, detections, actions] = await Promise.all([
      this.read("endpoints.json", endpointSchema), this.read("detections.json", detectionSchema), this.read("actions.json", actionSchema),
    ]);
    return {
      endpoints,
      detections: detections.map(({ actionId, ...d }) => ({ ...d, ...(actionId === undefined ? {} : { actionId }) })),
      actions: actions.map(({ executedAt, decidedBy, blockedReason, auditLog, ...a }) => ({ ...a,
        ...(executedAt === undefined ? {} : { executedAt }), ...(decidedBy === undefined ? {} : { decidedBy }),
        ...(blockedReason === undefined ? {} : { blockedReason }),
        auditLog: auditLog.map(({ detail, ...e }) => ({ ...e, ...(detail === undefined ? {} : { detail }) })),
      })),
    };
  }
  async getLabStats(): Promise<FileStats> { return this.readValue("stats.json", statsSchema); }
  async getDetections() { return structuredClone((await this.snapshot()).detections); }
  async getActions() { return structuredClone((await this.snapshot()).actions); }
  async getTuningChanges() { return structuredClone((await this.snapshot()).tuning); }
  async getExperiments(): Promise<ExperimentData> { return { source: "live", snapshot: structuredClone((await this.snapshot()).experiments) }; }
  /** Preserve the existing host-specific tuning visibility contract without adding JSON fields. */
  async getRuns(): Promise<Run[]> {
    const { experiments, tuning, stats } = await this.snapshot();
    if (!experiments.runs.length) return [];
    const linked = tuning.filter((c) => experiments.tuningLink.changeIds.includes(c.id));
    const techniques = experiments.scenarios.flatMap((s) => s.kind === "Attack" && s.technique ? [s.technique] : []);
    return [...new Set(linked.map((c) => c.hostId))].map((hostId) => ({ id: experiments.runs[0]?.id ?? "", timestamp: experiments.runs[0]?.startedAt ?? "", hostId, source: "live", testedTechniques: [...new Set(techniques)], eventsProcessed: stats.eventsProcessed, eventsPerSecond: stats.eventsPerSecond }));
  }
  async getBaselines() { return structuredClone((await this.snapshot()).baselines); }
  async getGuardrails(): Promise<GuardrailConfig> { return { approvalThreshold: 1, globalDryRun: false, protectedList: structuredClone(DEFAULT_PROTECTED) }; }
  async getBlockedAttempts(): Promise<BlockedAttempt[]> {
    return (await this.getActions()).filter((a) => a.status === "BlockedByGuardrail").map((a) => ({ id: a.id, at: a.createdAt, actionType: a.type, target: a.target, hostname: a.hostname, source: a.source, requestedBy: a.auditLog[0]?.actor ?? "agent", reason: a.blockedReason ?? a.auditLog.find((e) => e.event === "Blocked by guardrail")?.detail ?? "Blocked by guardrail" }));
  }
  async getFleetStats(): Promise<FleetStats> {
    const { endpoints, detections, actions, stats } = await this.snapshot();
    const now = Date.now();
    const byState: FleetStats["byState"] = { Protected: 0, Degraded: 0, Isolated: 0, Unmanaged: 0 };
    endpoints.forEach((e) => byState[e.protectionState]++);
    const trend: FleetStats["trend"] = Array.from({ length: 24 }, (_, i) => ({ hour: new Date(now - (23 - i) * 3600_000).toISOString().slice(11, 13) + ":00", Critical: 0, High: 0, Medium: 0, Low: 0 }));
    const recent = detections.filter((d) => { const age = now - Date.parse(d.timestamp); return age >= 0 && age < 86400_000; });
    recent.forEach((d) => { const bucket = trend[23 - Math.floor((now - Date.parse(d.timestamp)) / 3600_000)]; if (bucket) bucket[d.severity]++; });
    const durations = actions.flatMap((a) => { const d = detections.find((d) => d.id === a.detectionId); return a.executedAt && d ? [Math.max(0, Date.parse(a.executedAt) - Date.parse(d.timestamp)) / 1000] : []; });
    return { total: endpoints.length, byState, eventsProcessed: stats.eventsProcessed, eventsPerSecond: stats.eventsPerSecond, detections24h: stats.detections, actions: stats.actions, actionsAuto: stats.actionsByStatus.AutoExecuted, actionsHuman: stats.actionsByStatus.Approved, mttrSeconds: durations.length ? Math.round(durations.reduce((s, n) => s + n, 0) / durations.length) : 0, pendingApprovals: stats.actionsByStatus.PendingApproval, trend };
  }
  private readOnly(): never { throw new Error("File data is read-only. Update the JSON files from Python; changes appear on the next poll."); }
  private async decide(actionId: string, decision: "approve" | "reject" | "rollback"): Promise<Action> {
    try {
      // Re-read before checking eligibility; the service must independently enforce safety.
      this.cached = undefined;
      const action = (this.liveOnly ? (await this.getLiveSnapshot()).actions.filter((a) => a.source === "live") : await this.getActions()).find((a) => a.id === actionId);
      if (!action) throw new Error("Action not found in the current snapshot");
      if (decision === "approve" && !canApproveAction(action)) throw new Error("Approval blocked: evidence is unverified, a guardrail blocks this action, or it is no longer pending");
      if (decision === "reject" && action.status !== "PendingApproval") throw new Error("Only pending actions can be rejected");
      if (decision === "rollback" && (!action.rollbackAvailable || (action.status !== "Approved" && action.status !== "AutoExecuted"))) throw new Error("Rollback is not available for this action");
      const response = await this.fetcher("/api/decision", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, decision }), signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Decision service returned HTTP ${response.status}`);
      this.cached = undefined;
      this.loadedAt = 0;
      return structuredClone(action);
    } catch (error) {
      throw new Error(`Could not ${decision} ${actionId}: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }
  async approveAction(id: string): Promise<Action> { return this.decide(id, "approve"); }
  async rejectAction(id: string): Promise<Action> { return this.decide(id, "reject"); }
  async rollbackAction(id: string): Promise<Action> { return this.decide(id, "rollback"); }
  async setActionMode(_id: string, _mode: ActionMode): Promise<Action> { return this.readOnly(); }
  async requestAction(_id: string): Promise<Action> { return this.readOnly(); }
  async updateGuardrails(_patch: Partial<Pick<GuardrailConfig, "approvalThreshold" | "globalDryRun">>): Promise<GuardrailConfig> { return this.readOnly(); }
  async validateTuningChange(_id: string): Promise<TuningChange> { return this.readOnly(); }
  async applyTuningChange(_id: string): Promise<TuningChange> { return this.readOnly(); }
  async rollbackTuningChange(_id: string): Promise<TuningChange> { return this.readOnly(); }
}