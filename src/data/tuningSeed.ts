import type { LoggingConfig, Run, TuningChange } from "./types";

export function seedTuning(now: number): { changes: TuningChange[]; runs: Run[] } {
  let config: LoggingConfig = { networkConnections: false, dnsQueries: false, registryChanges: false, powerShellScriptBlock: false, managementChannel: true, agentService: true };
  const steps = [
    { key: "networkConnections", gap: "Sysmon network connection events (ID 3) not logged", observation: "Process creation (Sysmon ID 1) and firewall event 5156 show an outbound connection, but no matching Sysmon ID 3 exists.", events: ["EVT-SYS1-7F21B9", "EVT-5156-001"], techniques: ["T1071.001", "T1041"] },
    { key: "dnsQueries", gap: "Sysmon DNS query events (ID 22) not logged", observation: "Sysmon ID 3 shows a connection to an IP; DNS Client event 3008 records the lookup, but Sysmon ID 22 is absent.", events: ["EVT-SYS3-002", "EVT-DNS3008-002"], techniques: ["T1071.004"] },
    { key: "registryChanges", gap: "Sysmon registry changes (IDs 12–14) not logged", observation: "Security event 4657 reports a Run key write by a process recorded in Sysmon ID 1; no Sysmon ID 13 was collected.", events: ["EVT-4657-003", "EVT-SYS1-003"], techniques: ["T1547.001"] },
    { key: "powerShellScriptBlock", gap: "PowerShell script block logging (ID 4104) not enabled", observation: "Security event 4688 and Sysmon ID 1 show an encoded PowerShell invocation, with no corresponding script block event 4104.", events: ["EVT-4688-004", "EVT-SYS1-004"], techniques: ["T1059.001"] },
  ] as const;
  const changes = steps.map((step, i): TuningChange => {
    const before = { ...config };
    config = { ...config, [step.key]: true };
    return {
      id: `TUNE-00${i + 1}`, timestamp: new Date(now - (4 - i) * 15 * 60_000).toISOString(), hostId: "ep-0000", source: "simulated",
      visibilityGap: step.gap, evidence: { observation: step.observation, eventIds: [...step.events] },
      proposedChange: { system: i === 3 ? "AuditPolicy" : "Sysmon", before, after: { ...config } },
      justification: "Enable missing telemetry to detect the tested behavior while retaining management-channel and agent-service logging. Measure event volume before fleet rollout.",
      riskLevel: i === 2 ? "Medium" : "Low", status: i < 3 ? "Applied" : "Proposed",
      validationResult: i < 3 ? { configAccepted: true, serviceRunning: true, detail: "Demo validation: Sysmon accepted configuration; service remains running; expected test event collected." } : null,
      rollbackSnapshotId: `SNAP-00${i + 1}`, techniquesNowVisible: [...step.techniques],
    };
  });
  return { changes, runs: [{ id: "RUN-001", timestamp: new Date(now).toISOString(), hostId: "ep-0000", source: "simulated", testedTechniques: ["T1071.001", "T1041", "T1071.004", "T1547.001", "T1059.001", "T1003.001"], eventsProcessed: 48_210_000, eventsPerSecond: 1840 }] };
}