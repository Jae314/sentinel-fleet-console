import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useDetections, useEndpoints, useLiveAvailability } from "@/data/queries";
import { DATA_SOURCE, getDataSource } from "@/data/config";
import { isLiveEndpoint } from "@/data/liveStatus";
import { newLiveDetections, pipelineConnected } from "@/data/honesty";

const SourceStatusContext = createContext({ live: false, simulated: 0, demo: 0, unavailable: false, liveHosts: [] as string[], connected: false, updatedSeconds: null as number | null, highlightedIds: [] as string[] });
export const useSourceStatus = () => useContext(SourceStatusContext);
export function SourceStatusProvider({ children }: { children: ReactNode }) {
  const { data = [] } = useEndpoints();
  const availability = useLiveAvailability();
  const detections = useDetections();
  const seen = useRef<Set<string> | null>(null);
  const [arrivals, setArrivals] = useState<Record<string, number>>({});
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!detections.data || DATA_SOURCE === "mock") return;
    const additions = newLiveDetections(detections.data, seen.current);
    if (!seen.current) seen.current = new Set();
    detections.data.filter((d) => d.source === "live").forEach((d) => seen.current?.add(d.id));
    if (!additions.length) return;
    const expires = Date.now() + 5000;
    setArrivals((current) => ({ ...current, ...Object.fromEntries(additions.map((d) => [d.id, expires])) }));
    additions.forEach((d) => toast(`New detection on ${d.hostname}`));
  }, [detections.data]);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const live = isLiveEndpoint(DATA_SOURCE, data.find((e) => e.hostname === "WIN11-LAB-01"), now);
  const liveHosts = DATA_SOURCE === "mock" ? [] : data.filter((e) => e.source === "live" && now - Date.parse(e.lastSeen) >= 0 && now - Date.parse(e.lastSeen) < 60_000).map((e) => e.hostname);
  const lastSuccess = DATA_SOURCE === "mock" ? 0 : getDataSource().getLastSuccessfulLoad?.() ?? 0;
  return <SourceStatusContext.Provider value={{ live, liveHosts, connected: pipelineConnected(lastSuccess, now), updatedSeconds: lastSuccess && now >= lastSuccess ? Math.floor((now - lastSuccess) / 1000) : null, highlightedIds: Object.keys(arrivals).filter((id) => (arrivals[id] ?? 0) > now), unavailable: DATA_SOURCE === "hybrid" && availability.data === false, simulated: data.filter((e) => e.source === "simulated").length, demo: data.filter((e) => e.source === "live").length - liveHosts.length }}>{children}</SourceStatusContext.Provider>;
}