<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All app data flows through the `DataSource` interface, chosen by build-time VITE_DATA_SOURCE through config — so mock, file and hybrid share UI without branching page logic.
- Guardrail decisions live in pure functions in `src/data/guardrails.ts` and are covered by tests — so safety rules stay auditable and independent of the data source.
- Simulated records must always carry `source: "simulated"` and render a Simulated badge — never present simulated data as live.

- File snapshots are runtime-validated against strict schemas matching exported domain types; query polling refreshes seven feeds every five seconds without browser-side file writes, and stats.json supplies aggregate KPI counts independently of detail rows.
- File reads use VITE_DATA_BASE_URL with a /data fallback; response decisions always POST to same-origin /api/decision and invalidate cached queries after acknowledgement, so an external feed cannot redirect decision commands.
- Logging tuning status and visibility counting use pure guardrail functions; only validated, applied changes count against host-specific tested techniques.
- Endpoint freshness is evaluated centrally in SourceStatusProvider for file and hybrid records so every badge and fleet note uses the same observed live signal.
- HybridDataSource composes mock fleet estimates with an atomic validated three-feed live snapshot, replacing observed hosts and namespacing simulated action/detection IDs with SIM- to prevent cross-source decision collisions; failures replace stale observed data with simulated fallback.
- Lab aggregates use a separate DataSource getLabStats query that reads stats.json only from the lab panel in hybrid; hybrid getFleetStats stays mock-based so measurements cannot masquerade as fleet capacity.
- Baseline provenance is optional in the legacy JSON schema but explicit on mock records; hybrid remaps lab baseline endpoint references without changing their simulated provenance so observed endpoints cannot relabel synthetic behavior as live.
- JSON samples and public type definitions are produced by scripts/export-data.ts from MockDataSource, keeping Python contracts aligned with app records.
- Experiments consume an exact ExperimentSnapshot object from runs.json; provenance stays in the DataSource envelope, and reserved EXAMPLE- run IDs are suppressed when observed runs exist, so sample exports cannot masquerade as real sessions.
- Experiment metrics and comparisons live in tested pure functions; legacy tuning Run records are adapted from attack scenarios and linked tuning hosts in file mode, preserving the existing tuning page without extending the JSON contract.
- Pitch defaults, field constraints and pure cost/funnel calculations live together in src/data/pitchAssumptions.ts; the Scale & Cost page consumes existing DataSource metrics separately so assumptions never become reported telemetry.
