export type DataMode = "mock" | "file" | "hybrid";

export function resolveDataMode(value: string | undefined): DataMode {
  return value === "file" || value === "hybrid" ? value : "mock";
}