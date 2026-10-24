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
- All app data flows through the `DataSource` interface (`src/data/DataSource.ts`), chosen by the single `DATA_SOURCE` flag in `src/data/config.ts` — so a REST backend can replace the mock without touching UI.
- Guardrail decisions live in pure functions in `src/data/guardrails.ts` and are covered by tests — so safety rules stay auditable and independent of the data source.
- Simulated records must always carry `source: "simulated"` and render a Simulated badge — never present simulated data as live.
