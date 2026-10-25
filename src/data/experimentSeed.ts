import type { ExperimentSnapshot, ExperimentResult, ExperimentOutcome } from "./types";

/** Explicit illustrative session, never substituted into the file source. */
export function seedExperiments(): ExperimentSnapshot {
  const scenarios: ExperimentSnapshot["scenarios"] = [
    { id: "S01", name: "HTTPS beacon", kind: "Attack", technique: "T1071.001", description: "Controlled beacon to a test destination." },
    { id: "S02", name: "Outbound transfer", kind: "Attack", technique: "T1041", description: "Synthetic outbound transfer over the test C2 channel." },
    { id: "S03", name: "DNS beacon", kind: "Attack", technique: "T1071.004", description: "Repeated test-domain lookups emulating DNS command and control." },
    { id: "S04", name: "Run-key persistence", kind: "Attack", technique: "T1547.001", description: "Disposable Run-key entry created and removed in the lab." },
    { id: "S05", name: "Encoded PowerShell", kind: "Attack", technique: "T1059.001", description: "Harmless encoded script emulating a suspicious invocation." },
    { id: "S06", name: "LSASS access test", kind: "Attack", technique: "T1003.001", description: "Controlled credential-access simulation against a protected target." },
    { id: "S07", name: "Signed software updater", kind: "Benign", technique: null, description: "Approved signed updater contacts its normal distribution host." },
    { id: "S08", name: "Microsoft 365 sign-in", kind: "Benign", technique: null, description: "Normal browser sign-in and productivity traffic." },
  ];
  const weak: ExperimentOutcome[] = ["VisibilityGap", "VisibilityGap", "VisibilityGap", "FalseNegative", "TruePositive", "TruePositive", "FalsePositive", "TrueNegative"];
  const tuned: ExperimentOutcome[] = ["TruePositive", "TruePositive", "TruePositive", "TruePositive", "TruePositive", "TruePositive", "FalsePositive", "TrueNegative"];
  const results = (outcomes: ExperimentOutcome[]): ExperimentResult[] => scenarios.map((s, i) => {
    const outcome = outcomes[i] ?? "TrueNegative";
    const flagged = outcome === "TruePositive" || outcome === "FalsePositive";
    return { scenarioId: s.id, outcome, detectionId: flagged ? `EXAMPLE-DET-${s.id}` : null, verdict: flagged ? (s.kind === "Attack" ? "Malicious" : "NeedsMoreEvidence") : null,
      actionStatus: !flagged ? null : s.id === "S06" ? "BlockedByGuardrail" : s.kind === "Benign" ? "Rejected" : "PendingApproval",
      notes: outcome === "VisibilityGap" ? "Example: no relevant network or DNS telemetry was collected." : outcome === "FalseNegative" ? "Example: registry telemetry existed, but no rule raised a detection." : outcome === "FalsePositive" ? "Example: the signed updater was flagged and rejected by the analyst; logging tuning did not fix this false positive." : outcome === "TrueNegative" ? "Example: normal activity was not flagged." : "Example: the attack simulation raised a detection; no real endpoint action occurred." };
  });
  return { scenarios, runs: [
    { id: "EXAMPLE-RUN-1", label: "Run 1", startedAt: "2026-10-25T05:00:00.000Z", configLabel: "Weak baseline", results: results(weak) },
    { id: "EXAMPLE-RUN-2", label: "Run 2", startedAt: "2026-10-25T05:15:00.000Z", configLabel: "Weak baseline", results: results(weak) },
    { id: "EXAMPLE-RUN-3", label: "Run 3", startedAt: "2026-10-25T05:45:00.000Z", configLabel: "Tuned", results: results(tuned) },
  ], comparisons: [
    { id: "EXAMPLE-REPEAT", runAId: "EXAMPLE-RUN-1", runBId: "EXAMPLE-RUN-2", purpose: "Repeatability", explanations: [] },
    { id: "EXAMPLE-TUNING", runAId: "EXAMPLE-RUN-1", runBId: "EXAMPLE-RUN-3", purpose: "BeforeAfterTuning", explanations: scenarios.slice(0, 4).map((s) => ({ scenarioId: s.id, text: s.id === "S04" ? "Registry events became available to the detection pipeline after tuning." : "Enabling the missing network or DNS feed made the attack detectable." })) },
  ], tuningLink: { beforeRunId: "EXAMPLE-RUN-1", afterRunId: "EXAMPLE-RUN-3", changeIds: ["TUNE-001", "TUNE-002", "TUNE-003"] } };
}