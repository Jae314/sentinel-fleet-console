# Grim Reaper file contract

Set `config.dataSource` to `"file"` in `src/data/config.ts`. The default remains `"mock"`.

The console fetches `/data/endpoints.json`, `/data/detections.json`, `/data/actions.json`, `/data/tuning_changes.json`, and `/data/runs.json` every five seconds while open, with caching disabled. All five files must be present and valid. Each is a JSON array, not a wrapper object. Invalid fields, missing required fields, or invalid enum values produce an error instead of silently falling back to mock data.

## Types

`types.ts` is a downloadable copy of the exported contract in `src/data/types.ts`:

| File | Array element type |
|---|---|
| endpoints.json | Endpoint |
| detections.json | Detection |
| actions.json | Action |
| tuning_changes.json | TuningChange |
| runs.json | Run |

All timestamps are ISO 8601 UTC strings (e.g. `2026-10-24T07:14:00.000Z`). Optional fields may be omitted, not set to null. `validationResult` is explicitly nullable while validation is pending. References use endpoint IDs (`hostId` or `endpointId`), not hostnames. Preserve `source: "simulated"` on synthetic records. Samples are generated from MockDataSource, not collected from a real endpoint. The sample lab endpoint retains its existing `source: "live"` contract but is not shown as LIVE unless file mode and fresh.

`Run` adds an explicit host-specific `testedTechniques` list and observed event totals/rates. Fleet metrics use the newest run per host; the file-fed event count is not artificially ticked. Logging visibility counts the distinct tested technique IDs present in Applied changes for the selected host. Proposed, Validated, RolledBack, failed, and protected-reduction changes do not count.

## Logging configuration

`proposedChange.before` and `.after` are semantic logging settings (not an executable Sysmon XML document). Python should translate them into the actual Sysmon XML / Windows logging policy and validate it. `system: "AuditPolicy"` represents PowerShell script block logging policy in the samples. `validationResult.configAccepted` means the target logging system accepted the config; `serviceRunning` means its service remains healthy. Supply observed results, never assumed success. Guardrails downgrade an invalid Applied/Validated record to Proposed and display failed validation or protected logging reductions as RolledBack. The producer must actually restore `rollbackSnapshotId`; the read-only console does not execute an endpoint rollback.

File mode is read-only: approvals, settings, and tuning actions do not modify JSON or run commands. In mock mode, Validate/Apply/Rollback simulate the tuning lifecycle. A published static bundle cannot be rewritten by Python remotely: update served files in the local project, redeploy snapshots, or serve these paths from your host with an external producer.

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

Use atomic replacement for each file to avoid reading a partial write. Keep IDs consistent across all five snapshots.