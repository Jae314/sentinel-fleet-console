import { MockDataSource } from "./MockDataSource";
import { FileDataSource } from "./FileDataSource";
import type { Action, ActionMode, Detection, Endpoint } from "./types";

type LiveSnapshot = { endpoints: Endpoint[]; detections: Detection[]; actions: Action[]; available: boolean };
const simulatedId = (id: string) => `SIM-${id}`;

/** Only observed file records replace mock hosts; fleet metrics remain estimates. */
export class HybridDataSource extends MockDataSource {
  override readonly kind = "hybrid" as const;
  private pending: Promise<LiveSnapshot> | undefined;
  private cached: LiveSnapshot | undefined;
  private loadedAt = 0;
  private lastSuccessfulLoad = 0;
  getLastSuccessfulLoad = () => this.lastSuccessfulLoad;

  constructor(private files = new FileDataSource("/data", undefined, true), latency = 280) { super(latency); }

  private liveSnapshot(): Promise<LiveSnapshot> {
    if (this.pending) return this.pending;
    if (this.cached && Date.now() - this.loadedAt < 1000) return Promise.resolve(this.cached);
    this.pending = this.files.getLiveSnapshot().then((snapshot) => {
      const endpoints = snapshot.endpoints.filter((e) => e.source === "live");
      if (!endpoints.some((e) => e.hostname === "WIN11-LAB-01")) throw new Error("Lab endpoint missing");
      const ids = new Set(endpoints.map((e) => e.id));
      const detections = snapshot.detections.filter((d) => d.source === "live");
      const actions = snapshot.actions.filter((a) => a.source === "live");
      if ([...detections, ...actions].some((r) => !ids.has(r.endpointId) || !endpoints.some((e) => e.id === r.endpointId && e.hostname === r.hostname))) throw new Error("Live record host mismatch");
      for (const rows of [endpoints, detections, actions]) {
        if (new Set(rows.map((r) => r.id)).size !== rows.length || rows.some((r) => r.id.startsWith("SIM-"))) throw new Error("Duplicate or reserved IDs");
      }
      this.lastSuccessfulLoad = Date.now();
      return { endpoints, detections, actions, available: true };
    }).catch(() => ({ endpoints: [], detections: [], actions: [], available: false }))
      .then((snapshot) => { this.cached = snapshot; this.loadedAt = Date.now(); return snapshot; })
      .finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private replaced(r: { endpointId?: string; id?: string; hostname: string }, snapshot: LiveSnapshot) {
    return snapshot.endpoints.some((e) => e.hostname === r.hostname || e.id === (r.endpointId ?? r.id));
  }
  override async getEndpoints() {
    const [mock, live] = await Promise.all([super.getEndpoints(), this.liveSnapshot()]);
    return [...mock.filter((e) => !this.replaced(e, live)), ...live.endpoints];
  }
  override async getDetections() {
    const [mock, live] = await Promise.all([super.getDetections(), this.liveSnapshot()]);
    return [...mock.filter((d) => !this.replaced(d, live)).map((d) => ({ ...d, id: simulatedId(d.id), ...(d.actionId ? { actionId: simulatedId(d.actionId) } : {}) })), ...live.detections].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
  override async getActions() {
    const [mock, live] = await Promise.all([super.getActions(), this.liveSnapshot()]);
    return [...mock.filter((a) => !this.replaced(a, live)).map((a) => ({ ...a, id: simulatedId(a.id), detectionId: simulatedId(a.detectionId) })), ...live.actions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  override async getBlockedAttempts() {
    return (await this.getActions()).filter((a) => a.status === "BlockedByGuardrail").map((a) => ({ id: a.id, at: a.createdAt, actionType: a.type, target: a.target, hostname: a.hostname, source: a.source, requestedBy: a.auditLog[0]?.actor ?? "agent", reason: a.blockedReason ?? a.auditLog.find((e) => e.event === "Blocked by guardrail")?.detail ?? "Blocked by guardrail" }));
  }
  getLiveAvailability = async () => (await this.liveSnapshot()).available;
  override async getBaselines() {
    const [baselines, snapshot] = await Promise.all([super.getBaselines(), this.liveSnapshot()]);
    const lab = snapshot.endpoints.find((e) => e.hostname === "WIN11-LAB-01");
    return baselines.map((b) => ({ ...b, endpointId: b.endpointId === "ep-0000" && lab ? lab.id : b.endpointId, source: "simulated" as const }));
  }
  getLabStats = () => this.files.getLabStats();
  private async decide(id: string, decision: "approve" | "reject" | "rollback") {
    const action = (await this.getActions()).find((a) => a.id === id);
    if (!action) throw new Error("Action is no longer available");
    if (action.source === "simulated") {
      const result = await (decision === "approve" ? super.approveAction(id.slice(4)) : decision === "reject" ? super.rejectAction(id.slice(4)) : super.rollbackAction(id.slice(4)));
      return { ...result, id: simulatedId(result.id), detectionId: simulatedId(result.detectionId) };
    }
    try { return await (decision === "approve" ? this.files.approveAction(id) : decision === "reject" ? this.files.rejectAction(id) : this.files.rollbackAction(id)); }
    finally { this.cached = undefined; this.loadedAt = 0; }
  }
  override approveAction(id: string) { return this.decide(id, "approve"); }
  override rejectAction(id: string) { return this.decide(id, "reject"); }
  override rollbackAction(id: string) { return this.decide(id, "rollback"); }
  override async setActionMode(id: string, mode: ActionMode) {
    const action = (await this.getActions()).find((a) => a.id === id);
    if (!action || action.source !== "simulated") throw new Error("File action modes are read-only");
    const result = await super.setActionMode(id.slice(4), mode);
    return { ...result, id: simulatedId(result.id), detectionId: simulatedId(result.detectionId) };
  }
  override async requestAction(id: string) {
    const detection = (await this.getDetections()).find((d) => d.id === id);
    if (!detection || detection.source !== "simulated") throw new Error("File detections are read-only");
    const result = await super.requestAction(id.slice(4));
    return { ...result, id: simulatedId(result.id), detectionId: simulatedId(result.detectionId) };
  }
}