export type ProtectionState = "Protected" | "Degraded" | "Isolated" | "Unmanaged";
export type DataOrigin = "live" | "simulated";

export interface Endpoint {
  id: string;
  hostname: string;
  user: string;
  os: string;
  department: string;
  ip: string;
  protectionState: ProtectionState;
  lastSeen: string;
  source: DataOrigin;
}

export type Severity = "Critical" | "High" | "Medium" | "Low";
export type Verdict = "Malicious" | "Benign" | "NeedsMoreEvidence";
export type DetectionStatus = "New" | "Triaged" | "Responded" | "Dismissed";

export type ActionType =
  | "BlockDestination"
  | "KillProcess"
  | "QuarantineFile"
  | "DisableService"
  | "BlockDomain";
export type RiskLevel = "Low" | "Medium" | "High" | "Critical";
export type ActionMode = "DryRun" | "Live";
export type ActionStatus =
  | "PendingApproval"
  | "AutoExecuted"
  | "Approved"
  | "Rejected"
  | "BlockedByGuardrail"
  | "RolledBack";

export interface Technique {
  id: string;
  name: string;
  tactic: string;
}

export interface ProposedAction {
  type: ActionType;
  target: string;
  riskLevel: RiskLevel;
}

export interface Detection {
  id: string;
  endpointId: string;
  hostname: string;
  source: DataOrigin;
  timestamp: string;
  technique: Technique;
  rule: string;
  severity: Severity;
  confidence: number;
  verdict: Verdict;
  evidenceEventIds: string[];
  evidenceVerified: boolean;
  reasoningSummary: string;
  proposedAction: ProposedAction;
  status: DetectionStatus;
  actionId?: string;
}

export interface AuditEntry {
  at: string;
  actor: string;
  event: string;
  detail?: string;
}

export interface Action {
  id: string;
  detectionId: string;
  endpointId: string;
  hostname: string;
  source: DataOrigin;
  type: ActionType;
  target: string;
  riskLevel: RiskLevel;
  mode: ActionMode;
  status: ActionStatus;
  rollbackAvailable: boolean;
  evidenceVerified: boolean;
  createdAt: string;
  executedAt?: string;
  decidedBy?: "auto" | "human";
  auditLog: AuditEntry[];
}

export interface ProtectedEntry {
  name: string;
  kind: "process" | "service" | "channel";
  reason: string;
}

export interface GuardrailConfig {
  /** Highest risk rank (1=Low … 3=High) allowed to auto-execute. 0 = nothing auto-executes. Critical never does. */
  approvalThreshold: number;
  globalDryRun: boolean;
  protectedList: ProtectedEntry[];
}

export interface BlockedAttempt {
  id: string;
  at: string;
  actionType: ActionType;
  target: string;
  hostname: string;
  source: DataOrigin;
  requestedBy: string;
  reason: string;
}

export interface TrendPoint {
  hour: string;
  Critical: number;
  High: number;
  Medium: number;
  Low: number;
}

export interface FleetStats {
  total: number;
  byState: Record<ProtectionState, number>;
  eventsProcessed: number;
  eventsPerSecond: number;
  detections24h: number;
  actionsAuto: number;
  actionsHuman: number;
  mttrSeconds: number;
  pendingApprovals: number;
  trend: TrendPoint[];
}

export type TuningStatus = "Proposed" | "Validated" | "Applied" | "RolledBack";
export interface LoggingConfig {
  networkConnections: boolean;
  dnsQueries: boolean;
  registryChanges: boolean;
  powerShellScriptBlock: boolean;
  managementChannel: boolean;
  agentService: boolean;
}
export interface TuningChange {
  id: string;
  timestamp: string;
  hostId: string;
  source: DataOrigin;
  visibilityGap: string;
  evidence: { observation: string; eventIds: string[] };
  proposedChange: { system: "Sysmon" | "AuditPolicy"; before: LoggingConfig; after: LoggingConfig };
  justification: string;
  riskLevel: RiskLevel;
  status: TuningStatus;
  validationResult: { configAccepted: boolean; serviceRunning: boolean; detail: string } | null;
  rollbackSnapshotId: string;
  techniquesNowVisible: string[];
}

export interface Run {
  id: string;
  timestamp: string;
  hostId: string;
  source: DataOrigin;
  testedTechniques: string[];
  eventsProcessed: number;
  eventsPerSecond: number;
}
