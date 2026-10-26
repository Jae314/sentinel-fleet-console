import { describe, expect, it } from "vitest";
import { DEFAULT_PROTECTED, decideInitialStatus, requiresApproval } from "./guardrails";
import { MockDataSource } from "./MockDataSource";

const cfg = { approvalThreshold: 1, globalDryRun: false, protectedList: DEFAULT_PROTECTED };

describe("guardrails", () => {
  it("blocks killing a protected system process", () => {
    expect(decideInitialStatus({ type: "KillProcess", target: "lsass.exe", riskLevel: "Low" }, true, cfg).status).toBe(
      "BlockedByGuardrail",
    );
  });

  it("blocks the management channel", () => {
    expect(
      decideInitialStatus({ type: "BlockDestination", target: "mgmt.grimreaper.io:8443", riskLevel: "Low" }, true, cfg)
        .status,
    ).toBe("BlockedByGuardrail");
  });

  it("never auto-executes above the threshold", () => {
    expect(decideInitialStatus({ type: "BlockDomain", target: "bad.example", riskLevel: "Medium" }, true, cfg).status).toBe(
      "PendingApproval",
    );
    expect(decideInitialStatus({ type: "QuarantineFile", target: "C:\\x.com", riskLevel: "Low" }, true, cfg).status).toBe(
      "AutoExecuted",
    );
  });

  it("critical risk always requires approval even at max threshold", () => {
    expect(requiresApproval("Critical", 99)).toBe(true);
  });

  it("does not auto-execute when evidence is unverified", () => {
    expect(decideInitialStatus({ type: "QuarantineFile", target: "C:\\x.com", riskLevel: "Low" }, false, cfg).status).toBe(
      "PendingApproval",
    );
  });
});

describe("mock data source", () => {
  it("has 1,200 simulated endpoints and never presents mock records as live", async () => {
    const ds = new MockDataSource(0);
    const eps = await ds.getEndpoints();
    expect(eps).toHaveLength(1200);
    const live = eps.filter((e) => e.source === "live");
    expect(live).toHaveLength(0);
    expect(eps.filter((e) => e.source === "simulated")).toHaveLength(1200);
    expect((await ds.getDetections()).every((d) => d.source === "simulated")).toBe(true);
    expect((await ds.getActions()).every((a) => a.source === "simulated")).toBe(true);
    expect((await ds.getBaselines()).every((b) => b.source === "simulated")).toBe(true);
  });

  it("refuses to approve an action with unverified evidence", async () => {
    const ds = new MockDataSource(0);
    const action = (await ds.getActions()).find((a) => !a.evidenceVerified && a.status === "PendingApproval");
    expect(action).toBeDefined();
    if (!action) throw new Error("Missing unverified action");
    await expect(ds.approveAction(action.id)).rejects.toThrow();
  });
});
