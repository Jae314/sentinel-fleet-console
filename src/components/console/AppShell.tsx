import { Link } from "@tanstack/react-router";
import { Activity, FlaskConical, Gauge, Laptop, ShieldAlert, ShieldCheck, UserCheck, Zap, ListChecks, Calculator } from "lucide-react";
import type { ReactNode } from "react";
import { DATA_SOURCE } from "@/data/config";
import { useFleetStats } from "@/data/queries";
import { SourceStatusProvider, useSourceStatus } from "./SourceStatus";

const NAV = [
  { to: "/", label: "Fleet Overview", icon: Gauge },
  { to: "/detections", label: "Detections & Triage", icon: ShieldAlert },
  { to: "/response", label: "Response Center", icon: Zap },
  { to: "/guardrails", label: "Guardrails", icon: ShieldCheck },
  { to: "/tuning", label: "Logging Tuning", icon: ListChecks },
  { to: "/baselines", label: "User Baselining", icon: UserCheck },
  { to: "/experiments", label: "Experiments", icon: FlaskConical },
  { to: "/scale-cost", label: "Scale & Cost", icon: Calculator },
  { to: "/endpoints", label: "Endpoints", icon: Laptop },
] as const;

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 text-primary shadow-glow">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 20 L14 6" />
          <path d="M14 6 C 17 3, 21 5, 21 9 C 18 7, 16 7, 14 6 Z" fill="currentColor" />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="font-display text-sm font-bold tracking-wide">GRIM REAPER</div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Endpoint Defense</div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return <SourceStatusProvider><ConsoleShell>{children}</ConsoleShell></SourceStatusProvider>;
}

function ConsoleShell({ children }: { children: ReactNode }) {
  const { data } = useFleetStats();
  const source = useSourceStatus();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="px-5 py-5"><Logo /></div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-primary"
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{label}</span>
              {to === "/response" && !!data?.pendingApprovals && (
                <span className="rounded bg-warning/20 px-1.5 text-[10px] font-semibold text-warning">{data.pendingApprovals}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="m-3 rounded-md border border-sidebar-border p-3 text-[11px] text-muted-foreground">
          <div className="mb-1 flex items-center gap-1.5 text-foreground"><Activity className="h-3 w-3 text-success" /> Agent v2.4.1</div>
          {source.live ? "1 live endpoint" : `${source.demo} demo host`} · {source.simulated.toLocaleString()} simulated
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex h-14 items-center justify-between gap-4 px-4 md:px-8">
            <div className="md:hidden"><Logo /></div>
            <div className="hidden text-xs text-muted-foreground md:block">
              Tenant <span className="text-foreground">Acme Corp</span> · Region ap-southeast-1
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="rounded border border-primary/30 bg-primary/10 px-2 py-1 text-muted-foreground">
                Data source: <span className="font-mono font-semibold text-primary">{DATA_SOURCE}</span>
              </span>
              {DATA_SOURCE === "file" && <span className="text-muted-foreground">5s · file feeds</span>}
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
            {NAV.map(({ to, label }) => (
              <Link key={to} to={to} activeOptions={{ exact: to === "/" }}
                className="whitespace-nowrap rounded px-2.5 py-1 text-xs text-muted-foreground data-[status=active]:bg-accent data-[status=active]:text-primary">
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
