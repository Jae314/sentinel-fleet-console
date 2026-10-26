import { describe, expect, it, vi } from "vitest";
import { FileDataSource } from "./FileDataSource";
import { MockDataSource } from "./MockDataSource";
import { isLiveEndpoint } from "./liveStatus";
import { canApproveAction, safeTuningStatus, tuningProtectionViolation, visibleTestedTechniques } from "./guardrails";
import { seedTuning } from "./tuningSeed";

describe("file data and live honesty", () => {
  it("shows LIVE only in file mode and below 60 seconds old", async () => {
    const endpoint = (await new MockDataSource(0).getEndpoints())[0];
    if (!endpoint) throw new Error("Missing lab endpoint");
    const now = Date.now();
    const fresh = { ...endpoint, source: "live" as const, lastSeen: new Date(now - 59_999).toISOString() };
    expect(isLiveEndpoint("mock", fresh, now)).toBe(false);
    expect(isLiveEndpoint("file", fresh, now)).toBe(true);
    expect(isLiveEndpoint("file", { ...fresh, lastSeen: new Date(now - 60_000).toISOString() }, now)).toBe(false);
    expect(isLiveEndpoint("file", { ...fresh, lastSeen: "invalid" }, now)).toBe(false);
    expect(isLiveEndpoint("file", { ...fresh, source: "simulated" }, now)).toBe(false);
  });

  it("seeds one Active baseline with odd-hours logon, new process and new destination deviations", async () => {
    const baselines = await new MockDataSource(0).getBaselines();
    const active = baselines.find((b) => b.status === "Active");
    if (!active) throw new Error("Missing Active baseline");
    expect(active.logonHours).toHaveLength(24);
    expect(active.deviations.map((d) => d.kind).sort()).toEqual(["LogonTime", "NewDestination", "NewProcess"]);
    expect(active.deviations.every((d) => d.score >= 0 && d.score <= 1)).toBe(true);
    const learning = baselines.find((b) => b.status === "Learning");
    expect(learning?.deviations).toEqual([]);
  });

  it("reloads all seven exact file feeds after five seconds and rejects invalid records", async () => {
    vi.useFakeTimers();
    try {
      const mock = new MockDataSource(0);
      const endpoints = await mock.getEndpoints();
      const payloads: Record<string, unknown> = { "endpoints.json": endpoints, "detections.json": await mock.getDetections(), "actions.json": await mock.getActions(), "tuning_changes.json": await mock.getTuningChanges(), "runs.json": (await mock.getExperiments()).snapshot, "baselines.json": await mock.getBaselines(), "stats.json": statsFixture };
      const requests: string[] = [];
      const file = new FileDataSource("/data", async (input, init) => {
        const filename = String(input).split("/").at(-1) ?? "";
        requests.push(filename);
        expect(init?.cache).toBe("no-store");
        return new Response(JSON.stringify(payloads[filename]));
      });
      expect(await file.getEndpoints()).toHaveLength(1200);
      expect(requests).toEqual(["endpoints.json", "detections.json", "actions.json", "tuning_changes.json", "runs.json", "baselines.json", "stats.json"]);
      payloads["endpoints.json"] = endpoints.slice(0, 1);
      await vi.advanceTimersByTimeAsync(5000);
      expect(await file.getEndpoints()).toHaveLength(1);
      expect(requests).toHaveLength(14);
      payloads["endpoints.json"] = [{ ...endpoints[0], inventedField: 1 }];
      await vi.advanceTimersByTimeAsync(5000);
      await expect(file.getEndpoints()).rejects.toThrow("endpoints.json");
      await expect(file.setActionMode("ACT-1000", "Live")).rejects.toThrow("read-only");
    } finally { vi.useRealTimers(); }
  });
});

const statsFixture = { eventsProcessed: 87654321, eventsPerSecond: 4321, detections: 987, actions: 654, actionsByStatus: { PendingApproval: 123, AutoExecuted: 400, Approved: 254, Rejected: 12, BlockedByGuardrail: 8, RolledBack: 7 } };

async function fileFixture() {
  const mock = new MockDataSource(0);
  const actions = await mock.getActions();
  const payloads: Record<string, unknown> = { "endpoints.json": await mock.getEndpoints(), "detections.json": await mock.getDetections(), "actions.json": actions, "tuning_changes.json": await mock.getTuningChanges(), "runs.json": (await mock.getExperiments()).snapshot, "baselines.json": await mock.getBaselines(), "stats.json": statsFixture };
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (input === "/api/decision") return new Response(null, { status: 204 });
    expect(init?.cache).toBe("no-store");
    return new Response(JSON.stringify(payloads[String(input).split("/").at(-1) ?? ""]));
  });
  return { file: new FileDataSource("https://feeds.example.test/snapshots/", fetcher), fetcher, actions, payloads };
}

describe("file stats and response decisions", () => {
  it("reads the configurable base URL without duplicate slashes and uses stats instead of row counts", async () => {
    const { file, fetcher } = await fileFixture();
    const stats = await file.getFleetStats();
    expect(fetcher.mock.calls.map(([url]) => url)).toContain("https://feeds.example.test/snapshots/stats.json");
    expect(stats).toMatchObject({ eventsProcessed: 87654321, eventsPerSecond: 4321, detections24h: 987, actions: 654, actionsAuto: 400, actionsHuman: 254, pendingApprovals: 123 });
  });
  it("rejects invalid stats instead of using inferred metrics", async () => {
    const { file, payloads } = await fileFixture();
    payloads["stats.json"] = { ...statsFixture, detections: -1 };
    await expect(file.getFleetStats()).rejects.toThrow("stats.json");
  });
  for (const decision of ["approve", "reject", "rollback"] as const) {
    it(`POSTs the exact ${decision} command to same origin and refreshes without waiting for cached data`, async () => {
      const { file, fetcher, actions, payloads } = await fileFixture();
      const action = actions.find((a) => decision === "rollback" ? a.rollbackAvailable && (a.status === "Approved" || a.status === "AutoExecuted") : canApproveAction(a));
      if (!action) throw new Error("Missing eligible action");
      await file.getActions();
      await (decision === "approve" ? file.approveAction(action.id) : decision === "reject" ? file.rejectAction(action.id) : file.rollbackAction(action.id));
      const post = fetcher.mock.calls.find(([url]) => url === "/api/decision");
      expect(post?.[1]).toMatchObject({ method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actionId: action.id, decision }) });
      payloads["stats.json"] = { ...statsFixture, eventsProcessed: 999 };
      expect((await file.getFleetStats()).eventsProcessed).toBe(999);
    });
  }
  it("never approves unverified evidence", async () => {
    const { file, fetcher, actions, payloads } = await fileFixture();
    const action = actions[0];
    if (!action) throw new Error("Missing action");
    payloads["actions.json"] = [{ ...action, status: "PendingApproval", evidenceVerified: false }];
    await expect(file.approveAction(action.id)).rejects.toThrow("Approval blocked");
    expect(fetcher.mock.calls.some(([url]) => url === "/api/decision")).toBe(false);
  });
  it("never approves a guardrail-blocked action even with verified evidence", async () => {
    const { file, fetcher, actions, payloads } = await fileFixture();
    const action = actions[0];
    if (!action) throw new Error("Missing action");
    for (const status of ["PendingApproval", "BlockedByGuardrail"] as const) {
      payloads["actions.json"] = [{ ...action, status, evidenceVerified: true, blockedReason: "Management channel is protected" }];
      await expect(file.approveAction(action.id)).rejects.toThrow("Approval blocked");
    }
    expect(fetcher.mock.calls.some(([url]) => url === "/api/decision")).toBe(false);
  });
  it("preserves blockedReason and auditLog for action details", async () => {
    const { file, actions, payloads } = await fileFixture();
    const action = actions[0];
    if (!action) throw new Error("Missing action");
    payloads["actions.json"] = [{ ...action, blockedReason: "Protected management channel" }];
    expect((await file.getActions())[0]).toMatchObject({ blockedReason: "Protected management channel", auditLog: action.auditLog });
  });
  it("provides a clear error when the decision service fails", async () => {
    const { file, fetcher, actions } = await fileFixture();
    const action = actions.find(canApproveAction);
    if (!action) throw new Error("Missing eligible action");
    const original = fetcher.getMockImplementation();
    if (!original) throw new Error("Missing fetcher");
    fetcher.mockImplementation((input, init) => input === "/api/decision" ? Promise.resolve(new Response(null, { status: 503 })) : original(input, init));
    await expect(file.approveAction(action.id)).rejects.toThrow(`Could not approve ${action.id}: Decision service returned HTTP 503`);
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