import type { DataSource } from "./DataSource";
import { MockDataSource } from "./MockDataSource";
import { FileDataSource } from "./FileDataSource";
import { HybridDataSource } from "./HybridDataSource";
import { resolveDataMode } from "./dataMode";

/** Vite replaces this setting at build time; missing/invalid values use mock. */
export const config = { dataSource: resolveDataMode("hybrid") };
export const DATA_SOURCE = config.dataSource;
export const FILE_POLL_INTERVAL = 5_000;
export const DATA_BASE_URL = import.meta.env["VITE_DATA_BASE_URL"]?.trim() || "/data";

let instance: DataSource | null = null;
export function getDataSource(): DataSource {
  if (!instance) instance = config.dataSource === "file" ? new FileDataSource(DATA_BASE_URL) : config.dataSource === "hybrid" ? new HybridDataSource(new FileDataSource(DATA_BASE_URL, undefined, true)) : new MockDataSource();
  return instance;
}
