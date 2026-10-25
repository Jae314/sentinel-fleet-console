import { mkdir, writeFile, readFile } from "node:fs/promises";
import { MockDataSource } from "../src/data/MockDataSource";

const mock = new MockDataSource(0);
const fleet = await mock.getFleetStats();
const actions = await mock.getActions();
const samples = {
  "endpoints.json": await mock.getEndpoints(),
  "detections.json": await mock.getDetections(),
  "actions.json": actions.map((a) => a.status === "BlockedByGuardrail" ? { ...a, blockedReason: a.auditLog.find((e) => e.event === "Blocked by guardrail")?.detail ?? "Protected target" } : a),
  "tuning_changes.json": await mock.getTuningChanges(),
  "runs.json": await mock.getRuns(),
  "baselines.json": await mock.getBaselines(),
  "stats.json": { eventsProcessed: fleet.eventsProcessed, eventsPerSecond: fleet.eventsPerSecond, detections: fleet.detections24h, actions: fleet.actionsAuto + fleet.actionsHuman, actionsByStatus: Object.fromEntries(["PendingApproval", "AutoExecuted", "Approved", "Rejected", "BlockedByGuardrail", "RolledBack"].map((status) => [status, actions.filter((a) => a.status === status).length])) },
};
await mkdir("public/data", { recursive: true });
await Promise.all(Object.entries(samples).map(([file, records]) => writeFile(`public/data/${file}`, JSON.stringify(records, null, 2) + "\n")));
await writeFile("public/data/types.ts", await readFile("src/data/types.ts", "utf8"));
console.log("Exported seven mock snapshots and their TypeScript contract to public/data.");