import type { Action, ActionMode, BlockedAttempt, Detection, Endpoint, FleetStats, GuardrailConfig } from "./types";

export interface DataSource {
  readonly kind: "mock" | "rest";
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
