"""events.py: timestamp parsing and the contract validator."""
from datetime import datetime, timezone

import pytest

import events
from samples import SYSMON_PS


@pytest.mark.parametrize("raw, want", [
    ("2026-10-24T08:00:00.1234567Z", "2026-10-24T08:00:00Z"),
    ("2026-10-24T08:00:00Z", "2026-10-24T08:00:00Z"),
    ("2026-10-24 08:00:00", "2026-10-24T08:00:00Z"),
    ("2026-10-24T09:30:00.5+01:30", "2026-10-24T08:00:00Z"),
    ("2026-10-24T03:00:00-0500", "2026-10-24T08:00:00Z"),
])
def test_parse_utc(raw, want):
    assert events.iso_utc(events.parse_utc(raw)) == want


@pytest.mark.parametrize("raw", ["", "yesterday", "24/10/2026 08:00"])
def test_parse_utc_rejects_garbage(raw):
    assert events.parse_utc(raw) is None


def good():
    return events.from_xml(SYSMON_PS, "live")


def test_from_xml_record_is_valid():
    assert events.validate(good(), salt="") == []


@pytest.mark.parametrize("mutate, msg", [
    (lambda r: r.pop("data"), "missing data"),
    (lambda r: r.update(recordId="101"), "recordId must be int"),
    (lambda r: r.update(eventId=True), "eventId must be int"),
    (lambda r: r.update(source="replay"), "source must be one of"),
    (lambda r: r.update(timestamp="2026-10-24T08:00:00.123Z"), "timestamp must be"),
    (lambda r: r.update(id="EVT-1-zzzzzz"), "id does not match"),
    (lambda r: r.update(host="OTHER-HOST"), "does not match the ID rule"),
    (lambda r: r["data"].update(ProcessId=7724), "data.ProcessId"),
])
def test_validate_catches(mutate, msg):
    r = good()
    mutate(r)
    assert any(msg in e for e in events.validate(r, salt="")), events.validate(r, salt="")


def test_validate_without_salt_skips_id_recompute():
    r = good()
    r["host"] = "OTHER-HOST"  # replayed record: salt (file name) unknown, so only the format is checked
    assert events.validate(r) == []


def test_validate_non_object():
    assert events.validate(["not", "a", "dict"]) == ["record is not a JSON object"]


def test_parse_utc_is_aware():
    assert events.parse_utc("2026-10-24T08:00:00Z") == datetime(2026, 10, 24, 8, tzinfo=timezone.utc)
