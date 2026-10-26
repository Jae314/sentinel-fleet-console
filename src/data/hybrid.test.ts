import { describe, expect, it, vi } from "vitest";
import { HybridDataSource } from "./HybridDataSource";
import { FileDataSource } from "./FileDataSource";
import { MockDataSource } from "./MockDataSource";
import { resolveDataMode } from "./dataMode";
import { isLiveEndpoint } from "./liveStatus";

async function fixture() {
  const mock = new MockDataSource(0);
  const lab = (await mock.getEndpoints())[0];
  if (!lab) throw new Error("Missing lab");
  const endpoints = [{ ...lab, id: "lab-observed", source: "live", lastSeen: new Date().toISOString() }];
  const detections = (await mock.getDetections()).filter((d) => d.hostname === lab.hostname).map((d) => ({ ...d, endpointId: "lab-observed", source: "live" }));
  const actions = (await mock.getActions()).filter((a) => a.hostname === lab.hostname).map((a) => ({ ...a, endpointId: "lab-observed", source: "live" }));
  const stats = { eventsProcessed: 321, eventsPerSecond: 12, detections: 7, actions: 2, actionsByStatus: { PendingApproval: 1, AutoExecuted: 1, Approved: 1, Rejected: 0, BlockedByGuardrail: 0, RolledBack: 0 } };
  const payloads: Record<string, unknown> = { "endpoints.json": endpoints, "detections.json": detections, "actions.json": actions, "stats.json": stats };
  const fetcher = vi.fn(async (input: RequestInfo | URL) => input === "/api/decision" ? new Response(null, { status: 204 }) : new Response(JSON.stringify(payloads[String(input).split("/").at(-1) ?? ""] ?? null)));
  return { hybrid: new HybridDataSource(new FileDataSource("/data", fetcher, true), 0), mock, payloads, fetcher };
}

describe("build-time data selection", () => {
  it("defaults missing and invalid settings to mock and accepts exactly file/hybrid/mock", () => {
    expect(resolveDataMode(undefined)).toBe("mock");
    expect(resolveDataMode("unknown")).toBe("mock");
    expect(resolveDataMode("mock")).toBe("mock");
    expect(resolveDataMode("file")).toBe("file");
    expect(resolveDataMode("hybrid")).toBe("hybrid");
  });
});

describe("hybrid provenance and estimates", () => {
  it("retains 1199 simulated fleet endpoints and replaces the mock lab with the file host", async () => {
    const { hybrid } = await fixture();
    const endpoints = await hybrid.getEndpoints();
    expect(endpoints).toHaveLength(1200);
    expect(endpoints.filter((e) => e.source === "simulated")).toHaveLength(1199);
    expect(endpoints.filter((e) => e.hostname === "WIN11-LAB-01")).toMatchObject([{ id: "lab-observed", source: "live" }]);
  });
  it("imports only live file detections/actions and removes mock records for the observed host", async () => {
    const { hybrid, payloads, mock } = await fixture();
    payloads["detections.json"] = [...payloads["detections.json"] as object[], ...(await mock.getDetections()).slice(0, 1)];
    payloads["actions.json"] = [...payloads["actions.json"] as object[], ...(await mock.getActions()).slice(0, 1)];
    for (const rows of [await hybrid.getDetections(), await hybrid.getActions()]) {
      expect(rows.filter((r) => r.hostname === "WIN11-LAB-01").every((r) => r.source === "live" && r.endpointId === "lab-observed")).toBe(true);
      expect(rows.filter((r) => r.source === "simulated").every((r) => r.id.startsWith("SIM-"))).toBe(true);
    }
  });
  it("keeps baselines simulated even for a live endpoint with a different ID", async () => {
    const { hybrid } = await fixture();
    const baselines = await hybrid.getBaselines();
    expect(baselines.every((b) => b.source === "simulated")).toBe(true);
    expect(baselines[0]?.endpointId).toBe("lab-observed");
  });
  it("does not read stats for fleet KPIs, and reads exact lab aggregates separately", async () => {
    const { hybrid, fetcher } = await fixture();
    expect((await hybrid.getFleetStats()).eventsProcessed).toBeGreaterThan(48_000_000);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await hybrid.getLabStats()).toMatchObject({ eventsProcessed: 321, detections: 7, actions: 2 });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/data/stats.json"]);
  });
  it("requires a fresh observed timestamp below 60 seconds for LIVE in hybrid", async () => {
    const { hybrid } = await fixture();
    const lab = (await hybrid.getEndpoints()).find((e) => e.source === "live");
    if (!lab) throw new Error("Missing observed endpoint");
    const now = Date.now();
    expect(isLiveEndpoint("hybrid", { ...lab, lastSeen: new Date(now - 59_999).toISOString() }, now)).toBe(true);
    expect(isLiveEndpoint("hybrid", { ...lab, lastSeen: new Date(now - 60_000).toISOString() }, now)).toBe(false);
    expect(isLiveEndpoint("hybrid", { ...lab, source: "simulated" }, now)).toBe(false);
  });
  for (const filename of ["endpoints.json", "detections.json", "actions.json"]) {
    it(`falls back to a simulated lab and reports unavailable for invalid ${filename}`, async () => {
      const { hybrid, payloads } = await fixture();
      payloads[filename] = [{ inventedField: true }];
      expect(await hybrid.getLiveAvailability()).toBe(false);
      expect((await hybrid.getEndpoints()).filter((e) => e.source === "simulated")).toHaveLength(1200);
      expect((await hybrid.getDetections()).every((d) => d.source === "simulated")).toBe(true);
      expect((await hybrid.getActions()).every((a) => a.source === "simulated")).toBe(true);
    });
  }
  it("falls back for missing files and recovers on the next five-second poll", async () => {
    vi.useFakeTimers();
    try {
      const { hybrid, fetcher } = await fixture();
      const implementation = fetcher.getMockImplementation();
      if (!implementation) throw new Error("Missing fetch implementation");
      fetcher.mockImplementation(async () => new Response(null, { status: 404 }));
      expect(await hybrid.getLiveAvailability()).toBe(false);
      fetcher.mockImplementation(implementation);
      await vi.advanceTimersByTimeAsync(5000);
      expect(await hybrid.getLiveAvailability()).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it("routes live decisions to same origin and simulated decisions only to mock", async () => {
    const { hybrid, fetcher } = await fixture();
    const actions = await hybrid.getActions();
    const live = actions.find((a) => a.source === "live" && a.status === "PendingApproval");
    const simulated = actions.find((a) => a.source === "simulated" && a.status === "PendingApproval");
    if (!live || !simulated) throw new Error("Missing pending actions");
    await hybrid.rejectAction(live.id);
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/decision")).toHaveLength(1);
    expect((await hybrid.rejectAction(simulated.id)).source).toBe("simulated");
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/decision")).toHaveLength(1);
    expect((await hybrid.getActions()).find((a) => a.id === simulated.id)?.status).toBe("Rejected");
  });
});