import type { Endpoint } from "./types";

export function isLiveEndpoint(dataSource: string, endpoint: Endpoint | undefined, now = Date.now()): boolean {
  if (dataSource !== "file" || !endpoint || endpoint.source !== "live" || endpoint.hostname !== "WIN11-LAB-01") return false;
  const age = now - Date.parse(endpoint.lastSeen);
  return age >= 0 && age < 60_000;
}