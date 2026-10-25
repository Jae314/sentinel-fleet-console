"""Normalised event contract v1 (docs/event_schema.md), shared by every parser.

One implementation of the event ID rule and of Windows-XML -> contract parsing, so the
pipeline's XML/EVTX/live readers, the collector's normalizer and the --normalized reader
all produce identical evidence IDs for the same record.
"""
from __future__ import annotations

import hashlib
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

NS = "{http://schemas.microsoft.com/win/2004/08/events/event}"
SOURCES = ("live", "simulated")
REQUIRED = {"id": str, "recordId": int, "timestamp": str, "host": str, "source": str,
            "channel": str, "provider": str, "eventId": int, "data": dict}
ID_RE = re.compile(r"^EVT-(SYS)?\d+-[0-9A-F]{6}$")
TS_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
_TIME_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$")


def is_sysmon(provider: str) -> bool:
    return "sysmon" in (provider or "").lower()


def event_id(provider: str, event_code: int, host: str, channel: str, record_id: int, salt: str = "") -> str:
    """The contract's ID rule. salt is "" for live events, the source file name for replayed files."""
    h = hashlib.sha1(f"{salt}|{host}|{channel}|{record_id}".encode()).hexdigest()[:6].upper()
    return f"EVT-{'SYS' if is_sysmon(provider) else ''}{event_code}-{h}"


def parse_utc(value: str) -> datetime | None:
    """Windows SystemTime / ISO-8601 (any fraction length, Z or offset) -> aware UTC datetime.
    A value without a zone is taken as UTC (SystemTime is always UTC)."""
    m = _TIME_RE.match((value or "").strip())
    if not m:
        return None
    dt = datetime.strptime(f"{m.group(1)} {m.group(2)}", "%Y-%m-%d %H:%M:%S")
    zone = m.group(3)
    if zone and zone != "Z":
        zone = zone.replace(":", "")
        dt = datetime.strptime(f"{m.group(1)} {m.group(2)} {zone}", "%Y-%m-%d %H:%M:%S %z")
    else:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def iso_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _put(data: dict, key: str, value: str):
    # A repeated field name is never dropped: the values are collected into a list, in order.
    if key in data:
        data[key] = (data[key] if isinstance(data[key], list) else [data[key]]) + [value]
    else:
        data[key] = value


def raw_data(root: ET.Element) -> dict:
    """EventData/UserData exactly as Windows gives them. Unnamed <Data> gets "_<position>"
    (the XML has no name for it); other EventData children keep their tag (e.g. Binary)."""
    data: dict = {}
    ed = root.find(NS + "EventData")
    if ed is not None:
        for i, d in enumerate(ed):
            tag = d.tag.split("}")[-1]
            _put(data, d.get("Name") or (f"_{i}" if tag == "Data" else tag), d.text or "")
    ud = root.find(NS + "UserData")
    if ud is not None and len(ud):
        for d in list(ud)[0]:  # UserData wraps its fields in one provider-specific element
            _put(data, d.tag.split("}")[-1], "".join(d.itertext()))
    return data


def _to_int(v):
    try:
        s = str(v).strip()
        return int(s, 16) if s.lower().startswith("0x") else int(s)
    except (ValueError, TypeError):
        return None


def _first(data: dict, *names):
    for n in names:
        v = data.get(n)
        if isinstance(v, list):
            v = v[0] if v else None
        if v not in (None, "", "-"):
            return v
    return None


_CATEGORIES = {
    (True, 1): "process", (True, 3): "network", (True, 5): "process", (True, 7): "image_load",
    (True, 8): "process_access", (True, 10): "process_access", (True, 11): "file",
    (True, 12): "registry", (True, 13): "registry", (True, 14): "registry", (True, 22): "dns",
    (True, 23): "file", (True, 26): "file",
    (False, 4624): "logon", (False, 4625): "logon", (False, 4634): "logon", (False, 4648): "logon",
    (False, 4688): "process", (False, 4697): "service", (False, 4698): "scheduled_task",
    (False, 4720): "account", (False, 1102): "audit_log", (False, 7045): "service",
    (False, 4103): "script", (False, 4104): "script",
}


def convenience(provider: str, event_code: int, data: dict) -> dict:
    """OPTIONAL fields derived from data (never instead of it). Absent values are omitted, not null."""
    out: dict = {}
    cat = _CATEGORIES.get((is_sysmon(provider), event_code))
    if cat:
        out["category"] = cat
    user = _first(data, "User", "TargetUserName", "SubjectUserName")
    if user:
        out["user"] = user
    proc = {k: v for k, v in {
        "image": _first(data, "Image", "NewProcessName"),
        "commandLine": _first(data, "CommandLine"),
        "pid": _to_int(_first(data, "ProcessId", "NewProcessId")),
        "parentImage": _first(data, "ParentImage", "ParentProcessName"),
    }.items() if v is not None}
    if proc:
        out["process"] = proc
    net = {k: v for k, v in {
        "destIp": _first(data, "DestinationIp"),
        "destPort": _to_int(_first(data, "DestinationPort")),
        "domain": _first(data, "QueryName", "DestinationHostname"),
    }.items() if v is not None}
    if net:
        out["network"] = net
    path = _first(data, "TargetFilename")
    if path:
        out["file"] = {"path": path}
    return out


def from_xml(text: str, source: str, salt: str = "", host_fallback: str = "unknown-host") -> dict | None:
    """One <Event> XML string -> contract record, or None if it is not a usable event
    (unparseable, or missing EventID / EventRecordID / TimeCreated)."""
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return None
    sysel = root.find(NS + "System")
    if sysel is None:
        return None

    def t(tag):
        el = sysel.find(NS + tag)
        return (el.text or "").strip() if el is not None else ""

    prov = sysel.find(NS + "Provider")
    provider = prov.get("Name", "") if prov is not None else ""
    tc = sysel.find(NS + "TimeCreated")
    when = parse_utc(tc.get("SystemTime", "") if tc is not None else "")
    try:
        code, rec = int(t("EventID")), int(t("EventRecordID"))
    except ValueError:
        return None
    if when is None:
        return None
    channel, host = t("Channel"), t("Computer") or host_fallback
    data = raw_data(root)
    return {
        "id": event_id(provider, code, host, channel, rec, salt),
        "recordId": rec, "timestamp": iso_utc(when), "host": host, "source": source,
        "channel": channel, "provider": provider, "eventId": code, "data": data,
        **convenience(provider, code, data),
    }


def validate(rec, salt: str | None = None) -> list[str]:
    """Contract violations in one record ([] = valid). With salt given (e.g. "" for live
    records) the id is recomputed and must match exactly."""
    if not isinstance(rec, dict):
        return ["record is not a JSON object"]
    errs = []
    for k, typ in REQUIRED.items():
        v = rec.get(k)
        if v is None:
            errs.append(f"missing {k}")
        elif not isinstance(v, typ) or (typ is int and isinstance(v, bool)):
            errs.append(f"{k} must be {typ.__name__}")
    if errs:
        return errs
    if rec["source"] not in SOURCES:
        errs.append(f"source must be one of {SOURCES}")
    if not TS_RE.match(rec["timestamp"]):
        errs.append("timestamp must be UTC ISO-8601 like 2026-10-24T08:00:00Z")
    if not ID_RE.match(rec["id"]):
        errs.append("id does not match EVT-[SYS]<eventId>-<6 hex>")
    elif salt is not None:
        want = event_id(rec["provider"], rec["eventId"], rec["host"], rec["channel"], rec["recordId"], salt)
        if rec["id"] != want:
            errs.append(f"id {rec['id']} does not match the ID rule (expected {want})")
    for k, v in rec["data"].items():
        if not isinstance(v, (str, list)):
            errs.append(f"data.{k} must be the raw string value")
    return errs

