import type { Action, ActionMode, Baseline, BlockedAttempt, Detection, Endpoint, ExperimentData, FileStats, FleetStats, GuardrailConfig, Run, TuningChange } from "./types";

export interface DataSource {
  readonly kind: "mock" | "file" | "hybrid" | "rest";
  getLabStats?(): Promise<FileStats>;
  getLiveAvailability?(): Promise<boolean>;
  getLastSuccessfulLoad?(): number;
  getBaselines(): Promise<Baseline[]>;
  getTuningChanges(): Promise<TuningChange[]>;
  getRuns(): Promise<Run[]>;
  getExperiments(): Promise<ExperimentData>;
  validateTuningChange(id: string): Promise<TuningChange>;
  applyTuningChange(id: string): Promise<TuningChange>;
  rollbackTuningChange(id: string): Promise<TuningChange>;
  getEndpoints(): Promise<Endpoint[]>;
  getDetections(): Promise<Detection[]>;
  getActions(): Promise<Action[]>;
  getFleetStats(): Promise<FleetStats>;
  getGuardrails(): Promise<GuardrailConfig>;
  getBlockedAttempts(): Promise<BlockedAttempt[]>;
  approveAction(id: string): Promise<Action>;
  rejectAction(id: string): Promise<Action>;
  rollbackAction(id: string): Promise<Action>;
  setActionMode(id: string, mode: ActionMode): Promise<Action>;
  requestAction(detectionId: string): Promise<Action>;
  updateGuardrails(patch: Partial<Pick<GuardrailConfig, "approvalThreshold" | "globalDryRun">>): Promise<GuardrailConfig>;
}
