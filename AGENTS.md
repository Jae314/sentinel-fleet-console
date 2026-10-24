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
- All app data flows through the `DataSource` interface (`src/data/DataSource.ts`), chosen by `config.dataSource` in `src/data/config.ts` — so mock and read-only file feeds share UI without branching page logic.
- Guardrail decisions live in pure functions in `src/data/guardrails.ts` and are covered by tests — so safety rules stay auditable and independent of the data source.
- Simulated records must always carry `source: "simulated"` and render a Simulated badge — never present simulated data as live.

- File snapshots are runtime-validated against strict schemas matching exported domain types; query polling refreshes all five feeds every five seconds without browser-side file writes.
- Logging tuning status and visibility counting use pure guardrail functions; only validated, applied changes count against host-specific tested techniques.
- Endpoint freshness is evaluated centrally in SourceStatusProvider so every badge and fleet note uses the same file-only live signal.
- JSON samples and public type definitions are produced by scripts/export-data.ts from MockDataSource, keeping Python contracts aligned with app records.
