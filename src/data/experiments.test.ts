import { describe, expect, it, vi } from "vitest";
import { compareRuns, EMPTY_EXPERIMENTS, rateChange, runMetrics, selectExperimentSession } from "./experiments";
import { seedExperiments } from "./experimentSeed";
import { experimentSnapshotSchema } from "./fileSchemas";
import { MockDataSource } from "./MockDataSource";
import { FileDataSource } from "./FileDataSource";
import type { ExperimentRun } from "./types";

const data = seedExperiments();
const before = data.runs[0];
const repeat = data.runs[1];
const after = data.runs[2];
if (!before || !repeat || !after) throw new Error("Missing seeded run");

describe("experiment calculations", () => {
  it("counts each outcome from recorded results", () => {
    expect(runMetrics(before).counts).toEqual({ TruePositive: 2, FalsePositive: 1, FalseNegative: 1, TrueNegative: 1, VisibilityGap: 3 });
    expect(runMetrics(after).counts).toEqual({ TruePositive: 6, FalsePositive: 1, FalseNegative: 0, TrueNegative: 1, VisibilityGap: 0 });
  });
  it("uses TP / (TP + FN + VisibilityGap) for detection rate", () => {
    expect(runMetrics(before).detectionRate).toBe(2 / (2 + 1 + 3));
    expect(runMetrics(after).detectionRate).toBe(1);
  });
  it("uses TP / (TP + FP) for precision", () => {
    expect(runMetrics(before).precision).toBe(2 / (2 + 1));
    expect(runMetrics(after).precision).toBe(6 / (6 + 1));
  });
  it("computes changes in percentage points", () => {
    expect(rateChange(runMetrics(before).detectionRate, runMetrics(after).detectionRate)).toBeCloseTo(66.6666667);
    expect(rateChange(runMetrics(before).precision, runMetrics(after).precision)).toBeCloseTo(19.047619);
  });
  it("returns unavailable rates for zero denominators", () => {
    const empty: ExperimentRun = { ...before, results: [] };
    expect(runMetrics(empty)).toMatchObject({ detectionRate: null, precision: null });
    expect(rateChange(null, 1)).toBeNull();
  });
  it("computes identical outcomes and no differences for Run 1 vs Run 2", () => {
    expect(compareRuns(data, before, repeat)).toMatchObject({ identical: 8, total: 8, ratio: 1, differences: 0 });
  });
  it("highlights action-status differences even when outcomes are identical", () => {
    const changed = { ...repeat, results: repeat.results.map((r, i) => i === 0 ? { ...r, actionStatus: "Approved" } : r) };
    expect(compareRuns(data, before, changed)).toMatchObject({ identical: 8, differences: 1 });
  });
  it("counts missing results as nonidentical without inventing an outcome", () => {
    expect(compareRuns(data, before, { ...repeat, results: repeat.results.slice(1) })).toMatchObject({ identical: 7, ratio: 7 / 8, differences: 1 });
  });
  it("never retains example runs or comparisons alongside real recorded runs", () => {
    const actual = { ...before, id: "OBSERVED-001", label: "Observed session" };
    const selected = selectExperimentSession({ ...data, runs: [...data.runs, actual] }, "live");
    expect(selected.example).toBe(false);
    expect(selected.snapshot.runs.map((r) => r.id)).toEqual(["OBSERVED-001"]);
    expect(selected.snapshot.comparisons).toEqual([]);
    expect(selected.snapshot.tuningLink.changeIds).toEqual([]);
  });
  it("keeps empty recorded sessions empty and marks mock/sample provenance", async () => {
    expect(selectExperimentSession(EMPTY_EXPERIMENTS, "live")).toMatchObject({ example: false, snapshot: { runs: [] } });
    const mock = await new MockDataSource(0).getExperiments();
    expect(mock.source).toBe("simulated");
    expect(selectExperimentSession(mock.snapshot, mock.source).example).toBe(true);
    expect(selectExperimentSession(data, "live").example).toBe(true);
  });
});

describe("experiment file contract", () => {
  it("accepts exact object shape, null result fields and the empty snapshot", () => {
    expect(experimentSnapshotSchema.safeParse(data).success).toBe(true);
    expect(experimentSnapshotSchema.safeParse(EMPTY_EXPERIMENTS).success).toBe(true);
    expect(experimentSnapshotSchema.safeParse([before]).success).toBe(false);
    expect(experimentSnapshotSchema.safeParse({ ...data, source: "live" }).success).toBe(false);
  });
  it("rejects duplicate results, invalid references and inconsistent outcomes", () => {
    expect(experimentSnapshotSchema.safeParse({ ...data, runs: [{ ...before, results: [...before.results, before.results[0]] }] }).success).toBe(false);
    expect(experimentSnapshotSchema.safeParse({ ...data, tuningLink: { ...data.tuningLink, beforeRunId: "missing" } }).success).toBe(false);
    expect(experimentSnapshotSchema.safeParse({ ...data, runs: data.runs.map((r) => ({ ...r, results: r.results.map((result, i) => i === 0 ? { ...result, outcome: "FalsePositive" } : result) })) }).success).toBe(false);
  });
  it("loads changed recorded experiments after five seconds, without falling back to examples", async () => {
    vi.useFakeTimers();
    try {
      const mock = new MockDataSource(0);
      const fleet = await mock.getFleetStats();
      const payloads: Record<string, unknown> = {
        "endpoints.json": await mock.getEndpoints(), "detections.json": await mock.getDetections(), "actions.json": await mock.getActions(), "tuning_changes.json": await mock.getTuningChanges(), "baselines.json": await mock.getBaselines(), "runs.json": EMPTY_EXPERIMENTS,
        "stats.json": { eventsProcessed: fleet.eventsProcessed, eventsPerSecond: fleet.eventsPerSecond, detections: fleet.detections24h, actions: 0, actionsByStatus: { PendingApproval: 0, AutoExecuted: 0, Approved: 0, Rejected: 0, BlockedByGuardrail: 0, RolledBack: 0 } },
      };
      const file = new FileDataSource("/data", async (input) => new Response(JSON.stringify(payloads[String(input).split("/").at(-1) ?? ""])));
      expect((await file.getExperiments()).snapshot.runs).toEqual([]);
      payloads["runs.json"] = { ...data, runs: data.runs.map((r) => ({ ...r, id: r.id.replace("EXAMPLE-", "REAL-") })), comparisons: data.comparisons.map((c) => ({ ...c, runAId: c.runAId.replace("EXAMPLE-", "REAL-"), runBId: c.runBId.replace("EXAMPLE-", "REAL-") })), tuningLink: { ...data.tuningLink, beforeRunId: "REAL-RUN-1", afterRunId: "REAL-RUN-3" } };
      await vi.advanceTimersByTimeAsync(5000);
      const loaded = await file.getExperiments();
      expect(loaded.source).toBe("live");
      expect(loaded.snapshot.runs).toHaveLength(3);
      expect(selectExperimentSession(loaded.snapshot, loaded.source).example).toBe(false);
      expect((await file.getRuns())[0]?.testedTechniques).toEqual(["T1071.001", "T1041", "T1071.004", "T1547.001", "T1059.001", "T1003.001"]);
      payloads["runs.json"] = { invalid: true };
      await vi.advanceTimersByTimeAsync(5000);
      await expect(file.getExperiments()).rejects.toThrow("runs.json");
    } finally { vi.useRealTimers(); }
  });
});