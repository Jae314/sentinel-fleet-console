import type { DataSource } from "./DataSource";
import { MockDataSource } from "./MockDataSource";
import { FileDataSource } from "./FileDataSource";

/** Set dataSource to "file" to read Python-produced JSON in public/data. */
export const config: { dataSource: "mock" | "file" } = { dataSource: "mock" };
export const DATA_SOURCE = config.dataSource;
export const FILE_POLL_INTERVAL = 5_000;
export const DATA_BASE_URL = import.meta.env.VITE_DATA_BASE_URL?.trim() || "/data";

let instance: DataSource | null = null;
export function getDataSource(): DataSource {
  if (!instance) instance = config.dataSource === "file" ? new FileDataSource(DATA_BASE_URL) : new MockDataSource();
  return instance;
}
