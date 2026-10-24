# Grim Reaper — Security Operations Console (demo)

## Visual direction
- Dark navy base, one accent colour (electric cyan), with red/amber/green used only for severity and state.
- Fonts: Space Grotesk for headings, IBM Plex Sans for body text, JetBrains Mono for IDs, hashes and MITRE codes.
- Dense enterprise layout: left sidebar, a top bar showing the data-source indicator, and cards with thin borders.
- Skeleton screens while loading, plus proper empty states (for example "No pending approvals").

## Pages (each has its own URL)
1. **Fleet Overview** (`/`): KPI cards (endpoints protected, events processed with a live ticking rate, detections, actions split auto vs human-approved, MTTR), a protection-state donut chart, a 24h detections area chart, and a recent detections table.
2. **Detections & Triage** (`/detections`): filters for severity, verdict, status, source and search. A detail panel shows verdict, confidence bar, MITRE mapping, evidence event IDs with a green "verified in log store" check, reasoning summary and proposed action. If evidence is unverified, a red warning appears and the action button is disabled.
3. **Response Center** (`/response`): an approval queue limited to the five fixed action types. Each action shows its risk badge and a dry-run toggle, with Approve/Reject for pending actions and Rollback for executed ones. Each action's audit trail opens in a drawer. Actions above the threshold always stay in PendingApproval.
4. **Guardrails** (`/guardrails`): a locked allowlist (lsass.exe, csrss.exe, wininit.exe, services.exe, smss.exe, winlogon.exe, the Grim Reaper agent service and the management channel host:port), an approval-threshold slider, a global dry-run switch, and a log of blocked attempts.
5. **Endpoints** (`/endpoints`, optional sidebar entry): a virtualized-style paginated table of 1,200 hosts.

## Data honesty
- Exactly one endpoint, WIN11-LAB-01, has source="live" and gets a pulsing LIVE badge. Every other endpoint gets a muted "Simulated" badge.
- Fleet-level numbers carry a small "includes simulated fleet" note, so simulated data never reads as live.

## Seeded scenarios
- Encoded PowerShell (T1059.001) on WIN11-LAB-01: proposes KillProcess and waits for approval.
- EICAR test file (T1204.002): QuarantineFile, auto-executed, rollback available.
- Outbound connection to a known-bad domain (T1071.001): BlockDomain / BlockDestination.
- A KillProcess on lsass.exe that was BlockedByGuardrail and appears in the guardrail log.
- One detection with unverified evidence, to demonstrate the disabled action button.
- Plus around 300 generated detections across the fleet over 24h, using a deterministic seed.

## Technical details
- `src/data/types.ts`: Endpoint, Detection, Action, AuditEntry, GuardrailConfig, BlockedAttempt.
- `src/data/DataSource.ts`: an interface with async methods (getEndpoints, getDetections, getActions, approve/reject/rollback/setDryRun, getGuardrails, updateGuardrails, getFleetStats).
- `src/data/MockDataSource.ts`: a seeded PRNG, 1,200 endpoints, in-memory mutations and simulated latency.
- `src/data/RestDataSource.ts`: a stub that calls `fetch` against `API_BASE_URL`.
- `src/data/config.ts`: `DATA_SOURCE: "mock" | "rest"`, a single flag that picks the implementation.
- Guardrail logic lives in a pure module (`src/data/guardrails.ts`): protected-target check and threshold check. Vitest tests cover these rules: an action on a protected process gets BlockedByGuardrail, an action above the threshold never auto-executes, and an action with unverified evidence cannot execute.
- TanStack Query hooks per resource, with mutations that invalidate queries. Recharts for the charts. shadcn components.
- Each route gets its own head() metadata. AGENTS.md records the data-source abstraction rule.
