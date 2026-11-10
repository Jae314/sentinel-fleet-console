"""normalizer.py emits the contract (docs/event_schema.md) from collector lines."""
import hashlib
import json

import pytest

import events
import main
import storage
from normalizer import normalize_event
from samples import (CLASSIC, ENC, HOST, LOG_CLEARED, PS_FIELDS, REPEATED, SEC_4625, SEC_4688, SYSMON_DNS,
                     SYSMON_NET, SYSMON_PS, collector_line)


def norm(xml, **kw):
    return normalize_event(json.loads(collector_line(xml, "x", 0, 0)), **kw)


def spec_id(provider_is_sysmon, eid, host, channel, rec, salt=""):
    """The ID rule re-typed from docs/event_schema.md, independent of events.py."""
    h = hashlib.sha1(f"{salt}|{host}|{channel}|{rec}".encode()).hexdigest()[:6].upper()
    return "EVT-" + ("SYS" if provider_is_sysmon else "") + str(eid) + "-" + h


def test_required_fields_and_id_rule():
    r = norm(SYSMON_PS)
    assert r["id"] == spec_id(True, 1, HOST, "Microsoft-Windows-Sysmon/Operational", 101)
    assert (r["recordId"], r["eventId"], r["host"], r["source"]) == (101, 1, HOST, "live")
    assert r["channel"] == "Microsoft-Windows-Sysmon/Operational" and r["provider"] == "Microsoft-Windows-Sysmon"
    assert r["timestamp"] == "2026-10-24T08:00:00Z"  # 7-digit SystemTime fraction -> UTC seconds
    assert events.validate(r, salt="") == []
    s = norm(SEC_4625)
    assert s["id"] == spec_id(False, 4625, HOST, "Security", 303)


def test_data_is_raw_eventdata_untouched():
    r = norm(SYSMON_PS)
    assert r["data"] == dict(PS_FIELDS)  # same names, same order, same string values
    assert list(r["data"]) == [k for k, _ in PS_FIELDS]
    assert r["data"]["CommandLine"] == f'"powershell.exe" -nop -w hidden -enc {ENC}'
    assert norm(SEC_4688)["data"]["NewProcessId"] == "0x1f4c"  # hex kept as Windows gives it


def test_values_come_from_xml_never_from_message_text():
    raw = json.loads(collector_line(SYSMON_PS, "x", 0, 0, message="Process Create:\nImage: C:\\evil.exe"))
    assert normalize_event(raw)["data"]["Image"].endswith("powershell.exe")
    raw2 = dict(raw, message="something else entirely")
    assert normalize_event(raw2) == normalize_event(raw)
    with pytest.raises(ValueError, match="raw_xml"):
        normalize_event({k: v for k, v in raw.items() if k != "raw_xml"})


def test_userdata_fields():
    r = norm(LOG_CLEARED)
    assert r["data"] == {"SubjectUserSid": "S-1-5-21-1-2-3-1001", "SubjectUserName": "demo.analyst",
                         "SubjectDomainName": "LAB"}
    assert r["category"] == "audit_log" and r["user"] == "demo.analyst"


def test_unnamed_data_and_binary_are_kept():
    assert norm(CLASSIC)["data"] == {"_0": "Contoso Agent", "_1": "1.2.3", "_2": "1033", "Binary": "7B4142437D"}


def test_repeated_field_names_are_not_dropped():
    assert norm(REPEATED)["data"]["Tag"] == ["one", "two"]


def test_optional_convenience_fields():
    p = norm(SYSMON_PS)
    assert p["category"] == "process" and p["user"] == r"LAB\demo.analyst"
    assert p["process"] == {"image": r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
                            "commandLine": f'"powershell.exe" -nop -w hidden -enc {ENC}', "pid": 7724,
                            "parentImage": r"C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE"}
    assert norm(SEC_4688)["process"]["pid"] == 0x1F4C
    assert norm(SYSMON_DNS)["network"] == {"domain": "login-0ffice.net"}
    assert norm(SYSMON_NET)["network"] == {"destIp": "203.0.113.7", "destPort": 443, "domain": "cdn-update-sync.top"}
    c = norm(CLASSIC)
    assert not {"category", "user", "process", "network", "file"} & c.keys()  # omitted, never null


def test_no_null_values_anywhere():
    def walk(o):
        if isinstance(o, dict):
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
        else:
            assert o is not None
    for xml in (SYSMON_PS, SEC_4688, SEC_4625, SYSMON_DNS, SYSMON_NET, LOG_CLEARED, CLASSIC, REPEATED):
        walk(norm(xml))


def test_replay_salt_changes_id():
    live, replay = norm(SYSMON_PS), norm(SYSMON_PS, source="simulated", salt="lab1.evtx")
    assert replay["id"] == spec_id(True, 1, HOST, "Microsoft-Windows-Sysmon/Operational", 101, "lab1.evtx")
    assert live["id"] != replay["id"] and replay["source"] == "simulated"


@pytest.mark.parametrize("broken", [
    SYSMON_PS.replace("<EventRecordID>101</EventRecordID>", ""),
    SYSMON_PS.replace("SystemTime='2026-10-24T08:00:00.1234567Z'", ""),
    SYSMON_PS.replace("<EventID>1</EventID>", "<EventID>x</EventID>"),
    "<Event><not-closed>",
])
def test_unusable_events_raise_instead_of_guessing(broken):
    with pytest.raises(ValueError):
        norm(broken)


def test_main_module2_flow_without_powershell(tmp_path, monkeypatch):
    raw = tmp_path / "raw.jsonl"
    lines = [collector_line(x, "c", 0, i) for i, x in enumerate((SYSMON_PS, SEC_4625, LOG_CLEARED))]
    raw.write_text("\n".join(lines + ['{"message": "no xml here"}']) + "\n", encoding="utf-8")
    monkeypatch.setattr(main, "collect_events", lambda limit: (raw, 4))
    monkeypatch.setattr(main, "NORMALIZED_DIR", tmp_path / "normalized")
    monkeypatch.setattr(main, "REPORT_DIR", tmp_path / "reports")
    with pytest.raises(SystemExit, match="validation failed"):  # the line without raw_xml is a failure
        main.main()
    out = list(storage.read_jsonl(next((tmp_path / "normalized").glob("*.jsonl"))))
    assert [r["eventId"] for r in out] == [1, 4625, 1102]
    assert all(events.validate(r, salt="") == [] for r in out)
    report = json.loads(next((tmp_path / "reports").glob("*.json")).read_text())
    assert report["events_normalized"] == 3 and report["failures"][0]["line"] == 4
