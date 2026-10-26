import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useEndpoints, useLiveAvailability } from "@/data/queries";
import { DATA_SOURCE } from "@/data/config";
import { isLiveEndpoint } from "@/data/liveStatus";

const SourceStatusContext = createContext({ live: false, simulated: 0, demo: 0, unavailable: false, liveHosts: [] as string[] });
export const useSourceStatus = () => useContext(SourceStatusContext);
export function SourceStatusProvider({ children }: { children: ReactNode }) {
  const { data = [] } = useEndpoints();
  const availability = useLiveAvailability();
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const live = isLiveEndpoint(DATA_SOURCE, data.find((e) => e.hostname === "WIN11-LAB-01"), now);
  const liveHosts = DATA_SOURCE === "mock" ? [] : data.filter((e) => e.source === "live" && now - Date.parse(e.lastSeen) >= 0 && now - Date.parse(e.lastSeen) < 60_000).map((e) => e.hostname);
  return <SourceStatusContext.Provider value={{ live, liveHosts, unavailable: DATA_SOURCE === "hybrid" && availability.data === false, simulated: data.filter((e) => e.source === "simulated").length, demo: data.filter((e) => e.source === "live").length - liveHosts.length }}>{children}</SourceStatusContext.Provider>;
}