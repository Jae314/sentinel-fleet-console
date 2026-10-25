import type { ExperimentOutcome, ExperimentRun, ExperimentSnapshot } from "./types";

/** Never mix reserved example runs into an observed session. */
export function selectExperimentSession(snapshot: ExperimentSnapshot, source: "live" | "simulated") {
  const observed = snapshot.runs.filter((r) => !r.id.startsWith("EXAMPLE-"));
  const runs = observed.length ? observed : snapshot.runs;
  const ids = new Set(runs.map((r) => r.id));
  const scenarioIds = new Set(runs.flatMap((r) => r.results.map((result) => result.scenarioId)));
  return { example: runs.length > 0 && (observed.length === 0 || source === "simulated"), snapshot: {
    ...snapshot, runs,
    scenarios: observed.length && observed.length !== snapshot.runs.length ? snapshot.scenarios.filter((s) => scenarioIds.has(s.id)) : snapshot.scenarios,
    comparisons: snapshot.comparisons.filter((c) => ids.has(c.runAId) && ids.has(c.runBId)),
    tuningLink: ids.has(snapshot.tuningLink.beforeRunId) && ids.has(snapshot.tuningLink.afterRunId) ? snapshot.tuningLink : EMPTY_EXPERIMENTS.tuningLink,
  } };
}

export const EMPTY_EXPERIMENTS: ExperimentSnapshot = { scenarios: [], runs: [], comparisons: [], tuningLink: { beforeRunId: "", afterRunId: "", changeIds: [] } };
export const OUTCOMES: ExperimentOutcome[] = ["TruePositive", "FalsePositive", "FalseNegative", "TrueNegative", "VisibilityGap"];
export const OUTCOME_LEGEND: Record<ExperimentOutcome, string> = {
  TruePositive: "attack detected",
  FalseNegative: "attack telemetry existed but nothing was detected",
  VisibilityGap: "the attack left no relevant telemetry, so detection was impossible",
  FalsePositive: "benign activity flagged",
  TrueNegative: "benign activity not flagged",
};
export function runMetrics(run: ExperimentRun) {
  const counts: Record<ExperimentOutcome, number> = { TruePositive: 0, FalsePositive: 0, FalseNegative: 0, TrueNegative: 0, VisibilityGap: 0 };
  run.results.forEach((r) => counts[r.outcome]++);
  const attacks = counts.TruePositive + counts.FalseNegative + counts.VisibilityGap;
  const flagged = counts.TruePositive + counts.FalsePositive;
  return { counts, detectionRate: attacks ? counts.TruePositive / attacks : null, precision: flagged ? counts.TruePositive / flagged : null };
}
export function compareRuns(snapshot: ExperimentSnapshot, a: ExperimentRun, b: ExperimentRun) {
  const rows = snapshot.scenarios.map((scenario) => {
    const resultA = a.results.find((r) => r.scenarioId === scenario.id);
    const resultB = b.results.find((r) => r.scenarioId === scenario.id);
    const identicalOutcome = !!resultA && !!resultB && resultA.outcome === resultB.outcome;
    return { scenario, resultA, resultB, identicalOutcome, differs: !identicalOutcome || resultA?.actionStatus !== resultB?.actionStatus };
  });
  const identical = rows.filter((r) => r.identicalOutcome).length;
  return { rows, identical, total: rows.length, ratio: rows.length ? identical / rows.length : null, differences: rows.filter((r) => r.differs).length };
}
export function rateChange(before: number | null, after: number | null) { return before === null || after === null ? null : (after - before) * 100; }