# Normalised event contract (v1) — JSONL, one event per line

REQUIRED
id         string  EVT-[SYS]<eventId>-<6 hex>  (rule below)
recordId   int     EventRecordID
timestamp  string  UTC ISO-8601, e.g. 2026-10-24T08:00:00Z
host       string  Computer name
source     string  "live" | "simulated"
channel    string  e.g. Microsoft-Windows-Sysmon/Operational, Security
provider   string  Provider Name
eventId    int
data       object  RAW EventData/UserData, field names and values exactly as
                   Windows gives them (Image, CommandLine, ParentImage, ProcessId,
                   TargetFilename, QueryName, IpAddress...). Never rename or drop.

OPTIONAL convenience (derived from data, never instead of it)
category, user, process{image,commandLine,pid,parentImage},
network{destIp,destPort,domain}, file{path}

ID RULE (identical in every parser, so evidence IDs can be verified)
id = "EVT-" + ("SYS" if provider contains "sysmon" else "") + str(eventId)
     + "-" + sha1(f"{salt}|{host}|{channel}|{recordId}").hexdigest()[:6].upper()
salt = "" for live events; the source file name for replayed EVTX/XML files.

IMPLEMENTATION (backend/events.py is the only implementation; do not re-implement)
event_id()   the ID rule above
from_xml()   one Windows <Event> XML -> contract record (used by pipeline.py --evtx/--live,
             normalizer.py, and therefore the collector)
validate()   contract check; with salt="" (live records) it also recomputes the id

Edge cases, decided so nothing is dropped or invented:
- data comes from the event XML only ($e.ToXml() -> raw_xml), never from Message text.
- Unnamed <Data> (classic providers) -> key "_<position>"; other EventData children keep
  their tag (e.g. "Binary"). UserData -> the children of its single wrapper element.
- A repeated field name -> a list of its values, in order. All other values are strings.
- timestamp is TimeCreated/@SystemTime converted to UTC, truncated to whole seconds.
- A record without a valid EventID, EventRecordID or TimeCreated is rejected, not guessed.
- Optional fields are omitted when absent, never null.
- normalizer.py output contains the contract fields only; the original raw_xml and Message
  stay in the collector's raw file (data/raw/raw_events_*.jsonl).
