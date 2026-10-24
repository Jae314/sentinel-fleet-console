import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useEndpoints } from "@/data/queries";
import { DATA_SOURCE } from "@/data/config";
import { isLiveEndpoint } from "@/data/liveStatus";

const SourceStatusContext = createContext({ live: false, simulated: 0, demo: 0 });
export const useSourceStatus = () => useContext(SourceStatusContext);
export function SourceStatusProvider({ children }: { children: ReactNode }) {
  const { data = [] } = useEndpoints();
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const live = isLiveEndpoint(DATA_SOURCE, data.find((e) => e.hostname === "WIN11-LAB-01"), now);
  return <SourceStatusContext.Provider value={{ live, simulated: data.filter((e) => e.source === "simulated").length, demo: data.filter((e) => e.source === "live").length - Number(live) }}>{children}</SourceStatusContext.Provider>;
}