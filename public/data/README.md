# Grim Reaper file contract

Set `VITE_DATA_SOURCE=mock`, `file`, or `hybrid` before building/deploying. Missing or invalid values default to `mock`; changing the environment setting requires a new build, not a browser toggle.

Hybrid reads and validates `endpoints.json`, `detections.json` and `actions.json` together every five seconds. Only records with `source: "live"` enter the console; mock records for those hosts are replaced, not appended. The mock fleet, baselines, tuning, experiments and fleet KPI totals remain simulated/hypothetical. Hybrid reads `stats.json` separately only for “Measured on our lab VM”; a stats error never turns mock totals into lab measurements. No other feeds are required for hybrid. Missing/invalid live feeds or an absent live WIN11-LAB-01 show a visible unavailable banner and simulated mock-host fallback; later valid polls restore observed records. LIVE requires a file endpoint timestamp younger than 60 seconds (future timestamps are not live). Synthetic records always show Simulated, including fallback. Mock baseline `source` is explicit; legacy baselines without it remain accepted. Simulated action/detection IDs have a reserved `SIM-` prefix in hybrid to avoid collisions with producer IDs; do not use that prefix for observed IDs. Live decisions POST to `/api/decision`; simulated decisions stay in the mock lifecycle.

Set `VITE_DATA_BASE_URL` to the feed base URL (for example `https://your-feed.example/data`); the default is `/data`. Set it before starting or deploying the console. External feed hosts must allow the console origin through CORS. The console fetches `endpoints.json`, `detections.json`, `actions.json`, `tuning_changes.json`, `runs.json`, `baselines.json`, and `stats.json` every five seconds while open, with caching disabled. All seven files must be present and valid. `runs.json` and `stats.json` are single objects; the other files are arrays. Invalid fields, missing required fields, or invalid enum values produce an error instead of silently falling back to mock data.

## Types

`types.ts` is a downloadable copy of the exported contract in `src/data/types.ts`:

| File | Array element type |
|---|---|
| endpoints.json | Endpoint |
| detections.json | Detection |
| actions.json | Action |
| tuning_changes.json | TuningChange |
| runs.json | ExperimentSnapshot (single object) |
| baselines.json | Baseline |
| stats.json | FileStats (single object) |

All timestamps are ISO 8601 UTC strings (e.g. `2026-10-24T07:14:00.000Z`). Optional fields may be omitted, not set to null. `validationResult` is explicitly nullable while validation is pending. References use endpoint IDs (`hostId` or `endpointId`), not hostnames. Preserve `source: "simulated"` on synthetic records. Regenerated samples from MockDataSource are all simulated, not collected from a real endpoint; replace them with observed records for a live session rather than relabelling synthetic data.

The legacy `Run` type is an internal tuning-visibility adapter, not the runs.json contract. File-mode tested techniques come from attack scenarios in the experiment session, associated with hosts through tuningLink.changeIds and tuning_changes.json. Fleet event, detection and action KPIs use `stats.json`, not detail-row counts; file-fed event counts are not artificially ticked. `detections` is the producer's last-24-hour detection count; `actions` is its total actions-taken count. `actionsByStatus` supplies all six status counts: `PendingApproval`, `AutoExecuted`, `Approved`, `Rejected`, `BlockedByGuardrail`, and `RolledBack`. Auto and human-approved subtotals use `AutoExecuted` and `Approved`. Endpoint protection and response duration metrics still use detail feeds. Logging visibility counts the distinct tested technique IDs present in Applied changes for the selected host. Proposed, Validated, RolledBack, failed, and protected-reduction changes do not count.

## Logging configuration

`proposedChange.before` and `.after` are semantic logging settings (not an executable Sysmon XML document). Python should translate them into the actual Sysmon XML / Windows logging policy and validate it. `system: "AuditPolicy"` represents PowerShell script block logging policy in the samples. `validationResult.configAccepted` means the target logging system accepted the config; `serviceRunning` means its service remains healthy. Supply observed results, never assumed success. Guardrails downgrade an invalid Applied/Validated record to Proposed and display failed validation or protected logging reductions as RolledBack. The producer must actually restore `rollbackSnapshotId`; the read-only console does not execute an endpoint rollback.

File reads, settings, dry-run toggles and tuning actions remain read-only. Response Center Approve, Reject and Rollback POST exactly `{"actionId":"ACT-0001","decision":"approve"}` (or `reject` / `rollback`) to `/api/decision` on the console origin, never to `VITE_DATA_BASE_URL`. A successful HTTP response acknowledges the command; the console immediately refreshes active feeds and keeps polling every five seconds. Updated status and audit entries come from the producer's files, not an optimistic local edit. `Action.blockedReason` is optional and appears alongside `auditLog` in the action detail panel.

**Decision service required:** this project supplies the client request, not a decision server. Your same-origin host must handle `/api/decision`, authenticate/authorize the operator, validate the action ID and decision, independently enforce evidence/guardrails and lifecycle rules, and write updated snapshots. Return a successful HTTP status only after accepting the decision, or a non-2xx status on failure. Missing or failing services show an error toast. In mock mode, actions simulate the lifecycle. A published static bundle cannot be rewritten by Python remotely: update served files in the local project, redeploy snapshots, or serve the feeds from your external producer.

Regenerate samples and public type definitions with `bun scripts/export-data.ts`.

## Python output example

```python
import json
import os
from pathlib import Path
from datetime import datetime, timezone

path = Path("public/data/endpoints.json")
records = json.loads(path.read_text())
records[0]["lastSeen"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
# Only mark a host as live if this is real observed data, not a synthetic heartbeat.
temporary = path.with_suffix(".json.tmp")
temporary.write_text(json.dumps(records, indent=2))
os.replace(temporary, path)
```

Use atomic replacement for each file to avoid reading a partial write. Keep IDs consistent across all seven snapshots.

## Baselines

`baselines.json` holds one `Baseline` per endpoint/user. `logonHours` is exactly 24 counts (index = hour of day). `deviations` are review-only signals (`score` 0–1) and never trigger response actions; keep `evidenceVerified: false` when the referenced event IDs cannot be confirmed in the log store. While `status` is `Learning`, deviations should be empty — the console does not flag them.

## Experiments

`runs.json` now uses exactly `ExperimentSnapshot`: `{scenarios, runs, comparisons, tuningLink}`. This replaces the previous Run array. Scenarios retain file order. Each run contains a label, ISO startedAt, configLabel (`Weak baseline` or `Tuned`) and results with scenarioId, outcome, nullable detectionId/verdict/actionStatus, and notes. Comparisons reference run IDs and provide scenario-specific explanations; tuningLink names the before/after runs and tuning change IDs. Unknown references, duplicate IDs/results, extra fields and outcomes incompatible with scenario kind are rejected. A missing result displays `Not recorded` and is not counted as an identical outcome.

The reserved ID prefix `EXAMPLE-` identifies bundled example runs (and example scenarios/detections when needed). Production run IDs must not use this prefix. Mock records are marked `source: simulated` in the DataSource envelope, outside the exact JSON shape. File examples are labelled `Example data`; as soon as a non-example run exists, all example runs and their comparisons are excluded. No examples are inserted for an empty or failed file feed. Replace exported sample runs with observed records before a real session.

Empty snapshot: `{"scenarios":[],"runs":[],"comparisons":[],"tuningLink":{"beforeRunId":"","afterRunId":"","changeIds":[]}}` displays `No runs recorded yet`.

Repeatability is identical outcome pairs divided by scripted scenarios; action-status differences are highlighted separately. Detection rate is `TP / (TP + FN + VisibilityGap)`; precision is `TP / (TP + FP)`. Zero denominators display `N/A`, and changes are percentage-point differences. VisibilityGap means no relevant telemetry existed; FalseNegative means telemetry existed but no detection was raised. Logging changes are linked records, not an invented coverage score.