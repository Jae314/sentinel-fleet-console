import { z } from "zod";
import type { DataSource } from "./DataSource";
import type { Action, ActionMode, BlockedAttempt, Detection, Endpoint, FleetStats, GuardrailConfig, Run, TuningChange } from "./types";
import { actionSchema, detectionSchema, endpointSchema, runSchema, tuningSchema } from "./fileSchemas";
import { DEFAULT_PROTECTED, safeTuningStatus } from "./guardrails";

interface FileSnapshot { endpoints: Endpoint[]; detections: Detection[]; actions: Action[]; tuning: TuningChange[]; runs: Run[] }

/** Read-only Python-produced snapshots. No browser operation writes to public files. */
export class FileDataSource implements DataSource {
  readonly kind = "file" as const;
  private pending: Promise<FileSnapshot> | undefined;
  private cached: FileSnapshot | undefined;
  private loadedAt = 0;
  constructor(private base = "/data", private fetcher: typeof fetch = (input, init) => fetch(input, init)) {}

  private async read<T>(file: string, schema: z.ZodType<T>): Promise<T[]> {
    const response = await this.fetcher(`${this.base}/${file}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
    const parsed = z.array(schema).safeParse(await response.json());
    if (!parsed.success) throw new Error(`${file}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    return parsed.data;
  }
  private snapshot(): Promise<FileSnapshot> {
    if (this.pending) return this.pending;
    if (this.cached && Date.now() - this.loadedAt < 1000) return Promise.resolve(this.cached);
    this.pending = Promise.all([
      this.read("endpoints.json", endpointSchema), this.read("detections.json", detectionSchema), this.read("actions.json", actionSchema), this.read("tuning_changes.json", tuningSchema), this.read("runs.json", runSchema),
    ]).then(([endpoints, detections, actions, tuning, runs]) => {
      const result: FileSnapshot = {
        endpoints,
        detections: detections.map(({ actionId, ...d }) => ({ ...d, ...(actionId === undefined ? {} : { actionId }) })),
        actions: actions.map(({ executedAt, decidedBy, auditLog, ...a }) => ({ ...a,
          ...(executedAt === undefined ? {} : { executedAt }),
          ...(decidedBy === undefined ? {} : { decidedBy }),
          auditLog: auditLog.map(({ detail, ...e }) => ({ ...e, ...(detail === undefined ? {} : { detail }) })),
        })),
        tuning: tuning.map((c) => ({ ...c, status: safeTuningStatus(c) })), runs,
      };
      this.cached = result;
      this.loadedAt = Date.now();
      return result;
    }).finally(() => { this.pending = undefined; });
    return this.pending;
  }
  async getEndpoints() { return structuredClone((await this.snapshot()).endpoints); }
  async getDetections() { return structuredClone((await this.snapshot()).detections); }
  async getActions() { return structuredClone((await this.snapshot()).actions); }
  async getTuningChanges() { return structuredClone((await this.snapshot()).tuning); }
  async getRuns() { return structuredClone((await this.snapshot()).runs); }
  async getGuardrails(): Promise<GuardrailConfig> { return { approvalThreshold: 1, globalDryRun: false, protectedList: structuredClone(DEFAULT_PROTECTED) }; }
  async getBlockedAttempts(): Promise<BlockedAttempt[]> {
    return (await this.getActions()).filter((a) => a.status === "BlockedByGuardrail").map((a) => ({ id: a.id, at: a.createdAt, actionType: a.type, target: a.target, hostname: a.hostname, source: a.source, requestedBy: a.auditLog[0]?.actor ?? "agent", reason: a.auditLog.find((e) => e.event === "Blocked by guardrail")?.detail ?? "Blocked by guardrail" }));
  }
  async getFleetStats(): Promise<FleetStats> {
    const { endpoints, detections, actions, runs } = await this.snapshot();
    const now = Date.now();
    const byState: FleetStats["byState"] = { Protected: 0, Degraded: 0, Isolated: 0, Unmanaged: 0 };
    endpoints.forEach((e) => byState[e.protectionState]++);
    const trend: FleetStats["trend"] = Array.from({ length: 24 }, (_, i) => ({ hour: new Date(now - (23 - i) * 3600_000).toISOString().slice(11, 13) + ":00", Critical: 0, High: 0, Medium: 0, Low: 0 }));
    const recent = detections.filter((d) => { const age = now - Date.parse(d.timestamp); return age >= 0 && age < 86400_000; });
    recent.forEach((d) => { const bucket = trend[23 - Math.floor((now - Date.parse(d.timestamp)) / 3600_000)]; if (bucket) bucket[d.severity]++; });
    const durations = actions.flatMap((a) => { const d = detections.find((d) => d.id === a.detectionId); return a.executedAt && d ? [Math.max(0, Date.parse(a.executedAt) - Date.parse(d.timestamp)) / 1000] : []; });
    const latestByHost = new Map<string, Run>();
    [...runs].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).forEach((r) => latestByHost.set(r.hostId, r));
    return { total: endpoints.length, byState, eventsProcessed: [...latestByHost.values()].reduce((s, r) => s + r.eventsProcessed, 0), eventsPerSecond: [...latestByHost.values()].reduce((s, r) => s + r.eventsPerSecond, 0), detections24h: recent.length, actionsAuto: actions.filter((a) => a.decidedBy === "auto" && a.status !== "RolledBack").length, actionsHuman: actions.filter((a) => a.decidedBy === "human" && a.status === "Approved").length, mttrSeconds: durations.length ? Math.round(durations.reduce((s, n) => s + n, 0) / durations.length) : 0, pendingApprovals: actions.filter((a) => a.status === "PendingApproval").length, trend };
  }
  private readOnly(): never { throw new Error("File data is read-only. Update the JSON files from Python; changes appear on the next poll."); }
  async approveAction(_id: string): Promise<Action> { return this.readOnly(); }
  async rejectAction(_id: string): Promise<Action> { return this.readOnly(); }
  async rollbackAction(_id: string): Promise<Action> { return this.readOnly(); }
  async setActionMode(_id: string, _mode: ActionMode): Promise<Action> { return this.readOnly(); }
  async requestAction(_id: string): Promise<Action> { return this.readOnly(); }
  async updateGuardrails(_patch: Partial<Pick<GuardrailConfig, "approvalThreshold" | "globalDryRun">>): Promise<GuardrailConfig> { return this.readOnly(); }
  async validateTuningChange(_id: string): Promise<TuningChange> { return this.readOnly(); }
  async applyTuningChange(_id: string): Promise<TuningChange> { return this.readOnly(); }
  async rollbackTuningChange(_id: string): Promise<TuningChange> { return this.readOnly(); }
}