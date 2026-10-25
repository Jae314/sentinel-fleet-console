import { describe, expect, it } from "vitest";
import { calculatePitch, pitchAssumptions, updatePitch } from "./pitchAssumptions";

describe("pitch assumptions, not measured costs", () => {
  it("defaults to 1,000 endpoints and enforces 100–10,000", () => {
    expect(pitchAssumptions.endpoints).toBe(1000);
    expect(updatePitch(pitchAssumptions, "endpoints", 1).endpoints).toBe(100);
    expect(updatePitch(pitchAssumptions, "endpoints", 20000).endpoints).toBe(10000);
  });
  it("calculates token costs separately and derives monthly and per-endpoint costs", () => {
    const result = calculatePitch({ ...pitchAssumptions, endpoints: 1000, eventsPerEndpoint: 10000, candidatePercent: 0.1, callsPerCandidate: 2, inputTokens: 1000, outputTokens: 100, inputPrice: 1, outputPrice: 2, minutesSaved: 6 });
    expect(result.calls).toBe(20000);
    expect(result.dailyCost).toBe(24);
    expect(result.monthlyCost).toBe(720);
    expect(result.perEndpoint).toBe(0.72);
    expect(result.analystHours).toBe(30000);
  });
  it("computes every funnel stage and splits actions without double counting", () => {
    const result = calculatePitch({ ...pitchAssumptions, endpoints: 100, eventsPerEndpoint: 1000, ruleMatchPercent: 10, candidatePercent: 1, maliciousPercent: 20, actionPercent: 50, autoPercent: 60 });
    expect(result).toMatchObject({ events: 100000, matches: 10000, candidates: 1000, malicious: 200, actions: 100, auto: 60, human: 40 });
  });
  it("keeps candidates a subset of rule matches", () => {
    expect(updatePitch(pitchAssumptions, "candidatePercent", 50).candidatePercent).toBe(1);
    expect(updatePitch(pitchAssumptions, "ruleMatchPercent", 0).candidatePercent).toBe(0);
  });
  it("zero calls means zero cost and no triaged candidates or time savings", () => {
    expect(calculatePitch({ ...pitchAssumptions, callsPerCandidate: 0 })).toMatchObject({ calls: 0, dailyCost: 0, monthlyCost: 0, analystHours: 0, malicious: 0, actions: 0 });
  });
});