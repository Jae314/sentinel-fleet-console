import type { Action, ActionMode, ActionStatus, Detection } from "./types";

export function responseEffect(status: ActionStatus | "Responded", mode?: ActionMode) {
  if (!["AutoExecuted", "Approved", "Responded"].includes(status)) return null;
  return mode === "DryRun" ? "dry-run" : mode === "Live" ? "executed" : "unknown";
}

export function pipelineConnected(lastSuccess: number, now: number) {
  return lastSuccess > 0 && now >= lastSuccess && now - lastSuccess < 20_000;
}

/** Completed Live-mode actions only; missing/invalid times are not zero-duration responses. */
export function responseTimes(actions: Action[], detections: Detection[]) {
  const mean = (status: "AutoExecuted" | "Approved") => {
    const durations = actions.flatMap((a) => {
      if (a.status !== status || a.mode !== "Live" || !a.executedAt) return [];
      const d = detections.find((d) => d.id === a.detectionId && d.source === a.source);
      if (!d) return [];
      const duration = (Date.parse(a.executedAt) - Date.parse(d.timestamp)) / 1000;
      return Number.isFinite(duration) && duration >= 0 ? [duration] : [];
    });
    return durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
  };
  return { auto: mean("AutoExecuted"), human: mean("Approved") };
}

export function newLiveDetections(records: Detection[], previousIds: ReadonlySet<string> | null) {
  return previousIds === null ? [] : records.filter((d) => d.source === "live" && !previousIds.has(d.id));
}

export const usesExamples = (mode: string, origins: (string | undefined)[]) => mode !== "mock" && origins.includes("simulated");