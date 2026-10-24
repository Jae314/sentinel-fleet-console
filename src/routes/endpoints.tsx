import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Laptop, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Panel, PageHeader, RowsSkeleton, ago, Mono, EmptyState } from "@/components/console/common";
import { SourceBadge, StateBadge } from "@/components/console/badges";
import { useEndpoints } from "@/data/queries";
import type { ProtectionState } from "@/data/types";
import { useSourceStatus } from "@/components/console/SourceStatus";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/endpoints")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Endpoints — Grim Reaper" },
      { name: "description", content: "Inventory of all protected Windows endpoints in the fleet." },
      { property: "og:title", content: "Endpoints — Grim Reaper" },
      { property: "og:description", content: "Inventory of all protected Windows endpoints in the fleet." },
    ],
  }),
  component: Endpoints,
});

const PAGE = 25;
const STATES: (ProtectionState | "All")[] = ["All", "Protected", "Degraded", "Isolated", "Unmanaged"];

function Endpoints() {
  const source = useSourceStatus();
  const { data, isLoading } = useEndpoints();
  const [q, setQ] = useState("");
  const [state, setState] = useState<ProtectionState | "All">("All");
  const [page, setPage] = useState(0);
  const rows = useMemo(() => {
    const s = q.toLowerCase();
    return (data ?? []).filter((e) => (state === "All" || e.protectionState === state) && (!s || `${e.hostname} ${e.user} ${e.ip}`.toLowerCase().includes(s)));
  }, [data, q, state]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));

  return (
    <div>
      <PageHeader title="Endpoints" subtitle={`${source.live ? "1 live lab endpoint" : `${source.demo} demo host`} plus ${source.simulated.toLocaleString()} simulated endpoints.`} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search hostname, user, IP…" className="h-9 bg-card pl-8" />
        </div>
        <div className="flex flex-wrap gap-1">
          {STATES.map((s) => (
            <button key={s} onClick={() => { setState(s); setPage(0); }}
              className={cn("rounded-md border border-border px-3 py-1.5 text-xs", state === s ? "bg-accent text-primary" : "text-muted-foreground hover:bg-accent/50")}>{s}</button>
          ))}
        </div>
      </div>
      <Panel>
        {isLoading ? <RowsSkeleton rows={12} /> : !rows.length ? <EmptyState icon={<Laptop />} title="No endpoints match" /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border">{["Hostname", "User", "OS", "IP", "State", "Last seen"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(page * PAGE, page * PAGE + PAGE).map((e) => (
                    <tr key={e.id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                      <td className="px-4 py-2.5"><div className="flex items-center gap-2"><Mono>{e.hostname}</Mono><SourceBadge source={e.source} hostname={e.hostname} /></div></td>
                      <td className="px-4 py-2.5"><Mono className="text-muted-foreground">{e.user}</Mono></td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap">{e.os}</td>
                      <td className="px-4 py-2.5"><Mono className="text-muted-foreground">{e.ip}</Mono></td>
                      <td className="px-4 py-2.5"><StateBadge s={e.protectionState} /></td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{ago(e.lastSeen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
              <span>{rows.length.toLocaleString()} endpoints · page {page + 1} of {pages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
