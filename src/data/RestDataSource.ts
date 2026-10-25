import type { DataSource } from "./DataSource";
import type { ActionMode, Baseline, ExperimentData, GuardrailConfig, Run, TuningChange } from "./types";

/** Placeholder REST implementation — endpoints mirror the DataSource interface. */
export class RestDataSource implements DataSource {
  readonly kind = "rest" as const;
  constructor(private base: string) {}

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  getEndpoints = () => this.req<any>("/endpoints");
  getDetections = () => this.req<any>("/detections");
  getActions = () => this.req<any>("/actions");
  getTuningChanges = () => this.req<TuningChange[]>("/tuning-changes");
  getRuns = () => this.req<Run[]>("/runs");
  getExperiments = () => this.req<ExperimentData>("/experiments");
  getBaselines = () => this.req<Baseline[]>("/baselines");
  validateTuningChange = (id: string) => this.req<TuningChange>(`/tuning-changes/${id}/validate`, { method: "POST" });
  applyTuningChange = (id: string) => this.req<TuningChange>(`/tuning-changes/${id}/apply`, { method: "POST" });
  rollbackTuningChange = (id: string) => this.req<TuningChange>(`/tuning-changes/${id}/rollback`, { method: "POST" });
  getFleetStats = () => this.req<any>("/fleet/stats");
  getGuardrails = () => this.req<any>("/guardrails");
  getBlockedAttempts = () => this.req<any>("/guardrails/blocked");
  approveAction = (id: string) => this.req<any>(`/actions/${id}/approve`, { method: "POST" });
  rejectAction = (id: string) => this.req<any>(`/actions/${id}/reject`, { method: "POST" });
  rollbackAction = (id: string) => this.req<any>(`/actions/${id}/rollback`, { method: "POST" });
  setActionMode = (id: string, mode: ActionMode) =>
    this.req<any>(`/actions/${id}/mode`, { method: "POST", body: JSON.stringify({ mode }) });
  requestAction = (detectionId: string) => this.req<any>(`/detections/${detectionId}/request-action`, { method: "POST" });
  updateGuardrails = (patch: Partial<GuardrailConfig>) =>
    this.req<any>("/guardrails", { method: "PATCH", body: JSON.stringify(patch) });
}
