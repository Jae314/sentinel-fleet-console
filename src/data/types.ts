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
  proposedAction: ProposedAction | null;
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
  blockedReason?: string;
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
  actions?: number;
  mttrSeconds: number;
  pendingApprovals: number;
  trend: TrendPoint[];
}

/** stats.json is one object; counts are supplied by the producer, not inferred from row limits. */
export interface FileStats {
  eventsProcessed: number;
  eventsPerSecond: number;
  detections: number;
  actions: number;
  actionsByStatus: Record<ActionStatus, number>;
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

export type BaselineStatus = "Learning" | "Active";
export type DeviationKind = "LogonTime" | "NewProcess" | "NewDestination";
export interface Deviation {
  id: string;
  timestamp: string;
  kind: DeviationKind;
  subject: string;
  /** 0–1 anomaly score; review-only, never triggers actions. */
  score: number;
  reason: string;
  evidenceEventIds: string[];
  evidenceVerified: boolean;
}
export interface Baseline {
  endpointId: string;
  user: string;
  status: BaselineStatus;
  learningWindow: { start: string; end: string; eventCount: number };
  /** Logons observed per hour of day, index 0–23. */
  logonHours: number[];
  usualProcesses: { name: string; count: number; firstSeen: string }[];
  usualDestinations: { value: string; type: "domain" | "ip"; count: number }[];
  deviations: Deviation[];
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

export type ExperimentOutcome = "TruePositive" | "FalsePositive" | "FalseNegative" | "TrueNegative" | "VisibilityGap";
export interface Scenario {
  id: string;
  name: string;
  kind: "Attack" | "Benign";
  technique: string | null;
  description: string;
}
export interface ExperimentResult {
  scenarioId: string;
  outcome: ExperimentOutcome;
  detectionId: string | null;
  verdict: string | null;
  actionStatus: string | null;
  notes: string;
}
export interface ExperimentRun {
  id: string;
  label: string;
  startedAt: string;
  configLabel: "Weak baseline" | "Tuned";
  results: ExperimentResult[];
}
export interface ExperimentComparison {
  id: string;
  runAId: string;
  runBId: string;
  purpose: "Repeatability" | "BeforeAfterTuning";
  explanations: { scenarioId: string; text: string }[];
}
export interface ExperimentSnapshot {
  scenarios: Scenario[];
  runs: ExperimentRun[];
  comparisons: ExperimentComparison[];
  tuningLink: { beforeRunId: string; afterRunId: string; changeIds: string[] };
}
/** Provenance is supplied by the data source, outside the exact JSON contract. */
export interface ExperimentData { source: DataOrigin; snapshot: ExperimentSnapshot }
