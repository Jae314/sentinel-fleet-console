/** Illustrative USD assumptions, not measured workload or quoted model pricing. */
export const ASSUMPTION_LABEL = "Assumption — replace before presenting";
export const pitchFields = {
  endpoints: { label: "Number of endpoints", value: 1000, min: 100, max: 10000, step: 100, unit: "endpoints" },
  eventsPerEndpoint: { label: "Events per endpoint per day", value: 100000, min: 0, max: 1000000, step: 1000, unit: "events" },
  ruleMatchPercent: { label: "Rule matches or baseline deviations", value: 1, min: 0, max: 100, step: 0.01, unit: "% of events" },
  candidatePercent: { label: "Events that become AI candidates", value: 0.01, min: 0, max: 100, step: 0.001, unit: "% of events" },
  callsPerCandidate: { label: "AI triage calls per candidate", value: 1, min: 0, max: 10, step: 0.1, unit: "calls" },
  inputTokens: { label: "Input tokens per call", value: 2000, min: 0, max: 100000, step: 100, unit: "tokens" },
  outputTokens: { label: "Output tokens per call", value: 300, min: 0, max: 10000, step: 10, unit: "tokens" },
  inputPrice: { label: "Price per million input tokens", value: 0.5, min: 0, max: 100, step: 0.01, unit: "USD" },
  outputPrice: { label: "Price per million output tokens", value: 2, min: 0, max: 100, step: 0.01, unit: "USD" },
  minutesSaved: { label: "Analyst minutes saved per triaged candidate", value: 5, min: 0, max: 60, step: 0.5, unit: "minutes" },
  maliciousPercent: { label: "Candidates receiving malicious verdicts", value: 10, min: 0, max: 100, step: 1, unit: "% of triaged candidates" },
  actionPercent: { label: "Malicious verdicts leading to actions", value: 50, min: 0, max: 100, step: 1, unit: "% of malicious verdicts" },
  autoPercent: { label: "Actions auto-executed", value: 60, min: 0, max: 100, step: 1, unit: "% of actions; remainder human-approved" },
} as const;
export type PitchKey = keyof typeof pitchFields;
export type PitchInputs = Record<PitchKey, number>;
export const pitchAssumptions = Object.fromEntries(Object.entries(pitchFields).map(([key, field]) => [key, field.value])) as PitchInputs;
export const pitchPeriod = { daysPerMonth: 30 };

export function calculatePitch(input: PitchInputs) {
  const events = input.endpoints * input.eventsPerEndpoint;
  const matches = events * input.ruleMatchPercent / 100;
  const candidates = events * input.candidatePercent / 100;
  const calls = candidates * input.callsPerCandidate;
  const triagedCandidates = input.callsPerCandidate > 0 ? candidates : 0;
  const malicious = triagedCandidates * input.maliciousPercent / 100;
  const actions = malicious * input.actionPercent / 100;
  const auto = actions * input.autoPercent / 100;
  const human = actions - auto;
  const dailyCost = calls * (input.inputTokens * input.inputPrice + input.outputTokens * input.outputPrice) / 1000000;
  const monthlyCost = dailyCost * pitchPeriod.daysPerMonth;
  return { events, matches, candidates, calls, malicious, actions, auto, human, dailyCost, monthlyCost,
    perEndpoint: input.endpoints > 0 ? monthlyCost / input.endpoints : 0,
    analystHours: triagedCandidates * input.minutesSaved * pitchPeriod.daysPerMonth / 60 };
}

export function updatePitch(input: PitchInputs, key: PitchKey, value: number): PitchInputs {
  if (!Number.isFinite(value)) return input;
  const field = pitchFields[key];
  const next = { ...input, [key]: Math.min(field.max, Math.max(field.min, value)) };
  // AI candidates are a subset of deterministic matches, not a second independent stream.
  if (key === "ruleMatchPercent") next.candidatePercent = Math.min(next.candidatePercent, next.ruleMatchPercent);
  if (key === "candidatePercent") next.candidatePercent = Math.min(next.candidatePercent, next.ruleMatchPercent);
  return next;
}