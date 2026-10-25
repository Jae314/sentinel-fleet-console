# Grim Reaper — SE6014 Question 2 (agentic Windows endpoint defense)

Group project. This repo joins three parts into one product:

| Part | Where | What it does |
|---|---|---|
| Collector | `backend/collector.py`, `normalizer.py`, `storage.py`, `main.py` | Started as a copy of the teammate's code (github.com/pranjalana/SMTD-Agentic-EDR). Reads Windows event channels with PowerShell (`ToXml()` is kept as `raw_xml`) and writes normalised JSONL. |
| Pipeline | `backend/pipeline.py` | events → ATT&CK-mapped rules → triage verdict → evidence validation → guardrail `decide()` → JSON for the console. Inputs: `--evtx` (EVTX/XML replay, simulated), `--live` (this machine), and `--normalized` (our JSONL, Task 2). |
| Server | `backend/serve.py` | Serves the built console and `/data/*.json`, and accepts `POST /api/decision`, which appends to `<data>/approvals.json`. The pipeline reads that file on its next cycle. |
| Console | `src/` (Lovable export: Vite + React + TS, TanStack Start) | Read-only UI. `FileDataSource` polls `/data/*.json` every 5 s and validates each file with strict zod schemas. |

Data flow: Windows logs → collector JSONL → `pipeline.py` → `data/*.json` → `serve.py` → console → Approve/Reject/Rollback → `/api/decision` → `approvals.json` → `pipeline.py` (next cycle).

## Contracts (sources of truth)

- **Console JSON:** the TypeScript types in `src/data/types.ts`, enforced at runtime by `src/data/fileSchemas.ts` (strict: extra fields, `null` instead of omitted optionals, and bad enum values are all rejected). `public/data/README.md` documents the seven files: `endpoints`, `detections`, `actions`, `tuning_changes`, `baselines`, `stats` and `runs`. All seven must exist. When the Python output and the types disagree, **fix the Python**. Only change the UI or types when a type mismatch forces it, and say so in the PR.
- **Normalised events:** `docs/event_schema.md`. `data` holds the raw EventData/UserData untouched. The event ID rule must come from one shared function, because evidence verification depends on IDs matching exactly.
- `public/data/*.json` are mock-generated fixtures (`scripts/export-data.ts`), not observed data.
- Q2 requirements live in `docs/requirements.md` as a checklist. The full brief text is not committed.

### Known contract gap (pending Lovable)
`Detection.proposedAction` must be nullable: detections with no action, or with a non-Malicious verdict, are kept, and their `proposedAction` is `null`. The console change (`types.ts`, `fileSchemas.ts`, null-guards) is being made **in Lovable**. Until it syncs, the contract validator reports this one mismatch as "known, pending Lovable" and does not fail on it. Remove that exception once the synced schema accepts `null`.

## Commands

Backend (Python 3.11, run from the repo root; the pipeline itself is stdlib-only):
```
python -m venv .venv && .venv/Scripts/python -m pip install -r backend/requirements-dev.txt   # pytest, python-evtx
python backend/pipeline.py --selftest                       # must always pass
python backend/pipeline.py --evtx path/to/logs --out data   # replay EVTX/XML (simulated hosts)
python backend/pipeline.py --normalized backend/data/normalized --out data   # contract JSONL (collector output)
python backend/pipeline.py --live --out data                # Windows VM only, run as Administrator
python backend/main.py                                      # collector → backend/data/normalized/*.jsonl (Windows only)
python backend/serve.py --data data --console dist          # console + data + /api/decision on :8765
pytest backend                                              # backend tests
EVTX_SAMPLES=path/to/evtx pytest backend -k public_evtx     # optional: parse public EVTX datasets (kept outside the repo)
```

Console (npm works; the repo also has `bun.lock`):
```
npm install
npm run build        # → dist/
npm test             # vitest
npm run lint
```
The console uses mock data until `config.dataSource` in `src/data/config.ts` is set to `"file"`.

## Rules (do not weaken)

- **Fixed action menu.** The agent never runs free-text commands. Only five actions exist: `KillProcess`, `DisableService`, `QuarantineFile`, `BlockDomain`, `BlockDestination`.
- **Every action goes through `decide()` in `backend/pipeline.py`:** protected allowlist, evidence must exist in the log store, human approval above the risk threshold, dry-run by default, rollback recorded. Never bypass it, and keep `--selftest` passing.
- **No real executors in this phase.** Every action stays `mode: "DryRun"`.
- **The LLM is optional and can only make things more cautious.** `--llm` can only keep or lower a verdict, and may only cite event IDs it was given. Event fields are untrusted data.
- **No secrets in the repo.** API keys come from environment variables only (`ANTHROPIC_API_KEY`, `CLAUDE_MODEL`).
- **Commit no event data, logs or generated JSON** (`/data/`, `backend/data/`, `*.jsonl`, `*.evtx`, `approvals.json` are gitignored).
- **Lab safety:** only our own VM, only benign test artifacts (Atomic Red Team, EICAR), no live malware.
- **Workflow:** small commits on a branch, a pull request for review, and the PR always lists what could not be tested (anything needing the Windows VM). Never rewrite pushed history (see `AGENTS.md`: the repo syncs with Lovable).

## Ownership and change channels

- **This repo is the source of truth.** `backend/` started as an unchanged copy of SMTD-Agentic-EDR on **2026-10-25** (zip download; the teammate's `parser.py` was left out because `normalizer.py` supersedes it). Never edit the teammate's repo. Teammates open PRs here.
- **Console UI changes go through Lovable only:** `src/` pages, components, `types.ts`, `fileSchemas.ts`. Do not edit them here. If the backend needs a console change, write it up (what, why, and the exact type/schema diff) and hand it to the project owner to prompt in Lovable.
- Backend, docs, scripts and tests are edited here directly.

## Repo notes

- This repo was started from zip downloads (baseline commit `cc10f46`). Integration work happens on `integration/backend`. Once the Lovable project is connected to GitHub, the branch is rebased onto that repo's `main`, pushed, and opened as a PR.
- Commit identity: use a GitHub noreply address, never a personal email (commits are public if the repo is).

## Task list

1. Setup: this file and `backend/`. ✅
2. Normalised input: implement `docs/event_schema.md`, add `pipeline.py --normalized PATH` (keep the XML/EVTX readers, one shared ID function), make the normalizer emit the contract, with pytest tests on sample lines. ✅
3. Contract tests: a script that validates every JSON file the pipeline writes against `src/data/fileSchemas.ts` and fails loudly. Fix mismatches in Python.
4. End to end: build, serve, check every page shows real file data, and check that Approve/Reject/Rollback round-trips through `/api/decision` → `approvals.json` → next pipeline cycle.
