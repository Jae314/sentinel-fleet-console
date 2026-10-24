import { describe, expect, it, vi } from "vitest";
import { FileDataSource } from "./FileDataSource";
import { MockDataSource } from "./MockDataSource";
import { isLiveEndpoint } from "./liveStatus";
import { safeTuningStatus, tuningProtectionViolation, visibleTestedTechniques } from "./guardrails";
import { seedTuning } from "./tuningSeed";

describe("file data and live honesty", () => {
  it("shows LIVE only in file mode and below 60 seconds old", async () => {
    const endpoint = (await new MockDataSource(0).getEndpoints())[0];
    if (!endpoint) throw new Error("Missing lab endpoint");
    const now = Date.now();
    const fresh = { ...endpoint, lastSeen: new Date(now - 59_999).toISOString() };
    expect(isLiveEndpoint("mock", fresh, now)).toBe(false);
    expect(isLiveEndpoint("file", fresh, now)).toBe(true);
    expect(isLiveEndpoint("file", { ...fresh, lastSeen: new Date(now - 60_000).toISOString() }, now)).toBe(false);
    expect(isLiveEndpoint("file", { ...fresh, lastSeen: "invalid" }, now)).toBe(false);
    expect(isLiveEndpoint("file", { ...fresh, source: "simulated" }, now)).toBe(false);
  });

  it("reloads all five exact file feeds after five seconds and rejects invalid records", async () => {
    vi.useFakeTimers();
    try {
      const mock = new MockDataSource(0);
      const endpoints = await mock.getEndpoints();
      const payloads: Record<string, unknown> = { "endpoints.json": endpoints, "detections.json": await mock.getDetections(), "actions.json": await mock.getActions(), "tuning_changes.json": await mock.getTuningChanges(), "runs.json": await mock.getRuns() };
      const requests: string[] = [];
      const file = new FileDataSource("/data", async (input, init) => {
        const filename = String(input).split("/").at(-1) ?? "";
        requests.push(filename);
        expect(init?.cache).toBe("no-store");
        return new Response(JSON.stringify(payloads[filename]));
      });
      expect(await file.getEndpoints()).toHaveLength(1200);
      expect(requests).toEqual(["endpoints.json", "detections.json", "actions.json", "tuning_changes.json", "runs.json"]);
      payloads["endpoints.json"] = endpoints.slice(0, 1);
      await vi.advanceTimersByTimeAsync(5000);
      expect(await file.getEndpoints()).toHaveLength(1);
      expect(requests).toHaveLength(10);
      payloads["endpoints.json"] = [{ ...endpoints[0], inventedField: 1 }];
      await vi.advanceTimersByTimeAsync(5000);
      await expect(file.getEndpoints()).rejects.toThrow("endpoints.json");
      await expect(file.approveAction("ACT-1000")).rejects.toThrow("read-only");
    } finally { vi.useRealTimers(); }
  });
});

describe("logging tuning guardrails", () => {
  const change = seedTuning(Date.now()).changes[0];
  if (!change) throw new Error("Missing seeded tuning change");
  it("never reduces management-channel logging", () => {
    const reduced = { ...change, proposedChange: { ...change.proposedChange, after: { ...change.proposedChange.after, managementChannel: false } } };
    expect(tuningProtectionViolation(reduced)).toBe(true);
    expect(safeTuningStatus(reduced)).toBe("RolledBack");
  });
  it("never reduces the agent service logging", () => {
    const reduced = { ...change, proposedChange: { ...change.proposedChange, after: { ...change.proposedChange.after, agentService: false } } };
    expect(tuningProtectionViolation(reduced)).toBe(true);
    expect(safeTuningStatus(reduced)).toBe("RolledBack");
  });
  it("cannot apply before validation passes", async () => {
    const mock = new MockDataSource(0);
    await expect(mock.applyTuningChange("TUNE-004")).rejects.toThrow("validation");
    expect(safeTuningStatus({ ...change, validationResult: null })).toBe("Proposed");
    expect((await mock.validateTuningChange("TUNE-004")).status).toBe("Validated");
    expect((await mock.applyTuningChange("TUNE-004")).status).toBe("Applied");
  });
  it("automatically rolls back a rejected configuration", () => {
    expect(safeTuningStatus({ ...change, validationResult: { configAccepted: false, serviceRunning: true, detail: "rejected" } })).toBe("RolledBack");
  });
  it("automatically rolls back when the service stops", () => {
    expect(safeTuningStatus({ ...change, validationResult: { configAccepted: true, serviceRunning: false, detail: "stopped" } })).toBe("RolledBack");
  });
  it("counts only applied, unique tested techniques for the selected host", () => {
    const { changes, runs } = seedTuning(Date.now());
    expect(visibleTestedTechniques(changes, runs[0]?.testedTechniques ?? [], "ep-0000")).toEqual({ visible: 4, tested: 6 });
    expect(visibleTestedTechniques(changes, ["T1071.001", "T1071.001", "T9999"], "ep-0000")).toEqual({ visible: 1, tested: 2 });
    expect(visibleTestedTechniques(changes, ["T1071.001"], "other-host")).toEqual({ visible: 0, tested: 1 });
  });
  it("seeds network, DNS, registry, then PowerShell in order", () => {
    const { changes } = seedTuning(Date.now());
    expect(changes.map((c) => c.proposedChange.after)).toEqual([
      { networkConnections: true, dnsQueries: false, registryChanges: false, powerShellScriptBlock: false, managementChannel: true, agentService: true },
      { networkConnections: true, dnsQueries: true, registryChanges: false, powerShellScriptBlock: false, managementChannel: true, agentService: true },
      { networkConnections: true, dnsQueries: true, registryChanges: true, powerShellScriptBlock: false, managementChannel: true, agentService: true },
      { networkConnections: true, dnsQueries: true, registryChanges: true, powerShellScriptBlock: true, managementChannel: true, agentService: true },
    ]);
  });
});