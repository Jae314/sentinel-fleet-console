import { describe, expect, it } from "vitest";
import { newLiveDetections, pipelineConnected, responseEffect, responseTimes, usesExamples } from "./honesty";
import type { Action, Detection } from "./types";

describe("response honesty", () => {
  it("completed dry runs never imply execution", () => {
    for (const status of ["AutoExecuted", "Approved", "Responded"] as const) {
      expect(responseEffect(status, "DryRun")).toBe("dry-run");
      expect(responseEffect(status, "Live")).toBe("executed");
      expect(responseEffect(status)).toBe("unknown");
    }
    expect(responseEffect("PendingApproval", "Live")).toBeNull();
  });
  it("pipeline disconnects at 20 seconds without successful loads", () => {
    expect(pipelineConnected(1000, 20_999)).toBe(true);
    expect(pipelineConnected(1000, 21_000)).toBe(false);
    expect(pipelineConnected(0, 1000)).toBe(false);
  });
  it("splits auto and human timings and excludes dry runs", () => {
    const detections = [{ id: "d", source: "live", timestamp: "2026-10-26T00:00:00Z" }] as Detection[];
    const actions = [
      { detectionId: "d", source: "live", status: "AutoExecuted", mode: "Live", executedAt: "2026-10-26T00:00:10Z" },
      { detectionId: "d", source: "live", status: "Approved", mode: "Live", executedAt: "2026-10-26T00:01:00Z" },
      { detectionId: "d", source: "live", status: "Approved", mode: "DryRun", executedAt: "2026-10-26T00:10:00Z" },
    ] as Action[];
    expect(responseTimes(actions, detections)).toEqual({ auto: 10, human: 60 });
    expect(responseTimes([], detections)).toEqual({ auto: null, human: null });
  });
  it("notifies only subsequent unseen live detections", () => {
    const records = [{ id: "old", source: "live" }, { id: "new", source: "live" }, { id: "mock", source: "simulated" }] as Detection[];
    expect(newLiveDetections(records, null)).toEqual([]);
    expect(newLiveDetections(records, new Set(["old"])).map((d) => d.id)).toEqual(["new"]);
  });
  it("labels example-backed file/hybrid pages but not observed records", () => {
    expect(usesExamples("hybrid", ["simulated"])).toBe(true);
    expect(usesExamples("file", ["simulated", "live"])).toBe(true);
    expect(usesExamples("file", ["live"])).toBe(false);
    expect(usesExamples("mock", ["simulated"])).toBe(false);
  });
});