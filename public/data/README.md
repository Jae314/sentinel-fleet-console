# Grim Reaper file contract

Set `config.dataSource` to `"file"` in `src/data/config.ts`. The default remains `"mock"`.

Set `VITE_DATA_BASE_URL` to the feed base URL (for example `https://your-feed.example/data`); the default is `/data`. Set it before starting or deploying the console. External feed hosts must allow the console origin through CORS. The console fetches `endpoints.json`, `detections.json`, `actions.json`, `tuning_changes.json`, `runs.json`, and `stats.json` every five seconds while open, with caching disabled. All six files must be present and valid. The first five are JSON arrays; `stats.json` is a single object. Invalid fields, missing required fields, or invalid enum values produce an error instead of silently falling back to mock data.

## Types

`types.ts` is a downloadable copy of the exported contract in `src/data/types.ts`:

| File | Array element type |
|---|---|
| endpoints.json | Endpoint |
| detections.json | Detection |
| actions.json | Action |
| tuning_changes.json | TuningChange |
| runs.json | Run |
| stats.json | FileStats (single object) |

All timestamps are ISO 8601 UTC strings (e.g. `2026-10-24T07:14:00.000Z`). Optional fields may be omitted, not set to null. `validationResult` is explicitly nullable while validation is pending. References use endpoint IDs (`hostId` or `endpointId`), not hostnames. Preserve `source: "simulated"` on synthetic records. Samples are generated from MockDataSource, not collected from a real endpoint. The sample lab endpoint retains its existing `source: "live"` contract but is not shown as LIVE unless file mode and fresh.

`Run` adds an explicit host-specific `testedTechniques` list and observed event totals/rates. Fleet event, detection and action KPIs use `stats.json`, not detail-row counts; file-fed event counts are not artificially ticked. `detections` is the producer's last-24-hour detection count; `actions` is its total actions-taken count. `actionsByStatus` supplies all six status counts: `PendingApproval`, `AutoExecuted`, `Approved`, `Rejected`, `BlockedByGuardrail`, and `RolledBack`. Auto and human-approved subtotals use `AutoExecuted` and `Approved`. Endpoint protection and response duration metrics still use detail feeds. Logging visibility counts the distinct tested technique IDs present in Applied changes for the selected host. Proposed, Validated, RolledBack, failed, and protected-reduction changes do not count.

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

Use atomic replacement for each file to avoid reading a partial write. Keep IDs consistent across all six snapshots.