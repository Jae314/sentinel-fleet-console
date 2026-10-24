import type { DataSource } from "./DataSource";
import { MockDataSource } from "./MockDataSource";
import { RestDataSource } from "./RestDataSource";

/** Flip to "rest" to use a real backend at API_BASE_URL. */
export const DATA_SOURCE: "mock" | "rest" = "mock";
export const API_BASE_URL = "/api/v1";

let instance: DataSource | null = null;
export function getDataSource(): DataSource {
  if (!instance) instance = DATA_SOURCE === "rest" ? new RestDataSource(API_BASE_URL) : new MockDataSource();
  return instance;
}
