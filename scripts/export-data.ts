import { mkdir, writeFile, readFile } from "node:fs/promises";
import { MockDataSource } from "../src/data/MockDataSource";

const mock = new MockDataSource(0);
const samples = {
  "endpoints.json": await mock.getEndpoints(),
  "detections.json": await mock.getDetections(),
  "actions.json": await mock.getActions(),
  "tuning_changes.json": await mock.getTuningChanges(),
  "runs.json": await mock.getRuns(),
};
await mkdir("public/data", { recursive: true });
await Promise.all(Object.entries(samples).map(([file, records]) => writeFile(`public/data/${file}`, JSON.stringify(records, null, 2) + "\n")));
await writeFile("public/data/types.ts", await readFile("src/data/types.ts", "utf8"));
console.log("Exported five mock snapshots and their TypeScript contract to public/data.");