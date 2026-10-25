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
- All app data flows through the `DataSource` interface (`src/data/DataSource.ts`), chosen by `config.dataSource` in `src/data/config.ts` — so mock and file feeds share UI without branching page logic.
- Guardrail decisions live in pure functions in `src/data/guardrails.ts` and are covered by tests — so safety rules stay auditable and independent of the data source.
- Simulated records must always carry `source: "simulated"` and render a Simulated badge — never present simulated data as live.

- File snapshots are runtime-validated against strict schemas matching exported domain types; query polling refreshes seven feeds every five seconds without browser-side file writes, and stats.json supplies aggregate KPI counts independently of detail rows.
- File reads use VITE_DATA_BASE_URL with a /data fallback; response decisions always POST to same-origin /api/decision and invalidate cached queries after acknowledgement, so an external feed cannot redirect decision commands.
- Logging tuning status and visibility counting use pure guardrail functions; only validated, applied changes count against host-specific tested techniques.
- Endpoint freshness is evaluated centrally in SourceStatusProvider so every badge and fleet note uses the same file-only live signal.
- JSON samples and public type definitions are produced by scripts/export-data.ts from MockDataSource, keeping Python contracts aligned with app records.
- Experiments consume an exact ExperimentSnapshot object from runs.json; provenance stays in the DataSource envelope, and reserved EXAMPLE- run IDs are suppressed when observed runs exist, so sample exports cannot masquerade as real sessions.
- Experiment metrics and comparisons live in tested pure functions; legacy tuning Run records are adapted from attack scenarios and linked tuning hosts in file mode, preserving the existing tuning page without extending the JSON contract.
- Pitch defaults, field constraints and pure cost/funnel calculations live together in src/data/pitchAssumptions.ts; the Scale & Cost page consumes existing DataSource metrics separately so assumptions never become reported telemetry.
