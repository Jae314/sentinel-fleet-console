"""pipeline.py --normalized: contract JSONL in, same detections as the XML path."""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

import pipeline as P
from normalizer import normalize_event
from samples import (SEC_4625, SEC_4688, SYSMON_DNS, SYSMON_EICAR, SYSMON_NET, SYSMON_PS, collector_line)

BACKEND = Path(__file__).resolve().parents[1]
XMLS = [SYSMON_PS, SEC_4688, SEC_4625, SYSMON_DNS, SYSMON_NET, SYSMON_EICAR]


def write_normalized(path, xmls, extra_lines=()):
    recs = [normalize_event(json.loads(collector_line(x, "c", 0, 0))) for x in xmls]
    path.write_text("\n".join([json.dumps(r) for r in recs] + list(extra_lines)) + "\n", encoding="utf-8")
    return recs


def test_normalized_and_xml_paths_agree(tmp_path):
    f = tmp_path / "pipeline_1.jsonl"
    write_normalized(f, XMLS)
    a, b = P.Store(), P.Store()
    n, nf, bad = P.load_normalized([tmp_path], a, rebase=False)
    for x in XMLS:
        b.add(P.parse_event_xml(x, "live"))
    assert (n, nf, bad) == (len(XMLS), 1, 0)
    assert [e["id"] for e in a.events] == [e["id"] for e in b.events]
    assert a.events == b.events
    da, aa, *_ = P.build(a, P.Cfg(), {})
    db, ab, *_ = P.build(b, P.Cfg(), {})
    assert da == db and aa == ab
    rules = {d["rule"] for d in da}
    assert {"GR-PS-ENC-001", "GR-OFFICE-CHILD-001", "GR-SCHTASK-001", "GR-DNS-IOC-001", "GR-EICAR-001"} <= rules
    assert all(a_["mode"] == "DryRun" for a_ in aa)
    assert all(set(d["evidenceEventIds"]) <= a.by_id.keys() and d["evidenceVerified"] for d in da)


def test_invalid_lines_are_rejected_and_reported(tmp_path, capsys):
    good = write_normalized(tmp_path / "x.jsonl", [SYSMON_PS])[0]
    tampered = dict(good, recordId=999)  # live record whose id no longer matches the ID rule
    missing = {k: v for k, v in good.items() if k != "data"}
    write_normalized(tmp_path / "x.jsonl", [SYSMON_PS], ["{not json", json.dumps(tampered), json.dumps(missing), ""])
    store = P.Store()
    assert P.load_normalized([tmp_path / "x.jsonl"], store, rebase=False) == (1, 1, 3)
    err = capsys.readouterr().err
    assert "invalid JSON" in err and "does not match the ID rule" in err and "missing data" in err


def test_simulated_records_keep_their_source(tmp_path):
    rec = normalize_event(json.loads(collector_line(SYSMON_PS, "c", 0, 0)), source="simulated", salt="lab.evtx")
    (tmp_path / "s.jsonl").write_text(json.dumps(rec) + "\n", encoding="utf-8")
    store = P.Store()
    P.load_normalized([tmp_path], store, rebase=False)
    _, act, eps, _ = P.build(store, P.Cfg(), {})
    assert eps[0]["source"] == "simulated" and act[0]["source"] == "simulated"


def test_duplicate_records_across_inputs_are_stored_once(tmp_path):
    write_normalized(tmp_path / "a.jsonl", [SYSMON_PS])
    store = P.Store()
    store.add(P.parse_event_xml(SYSMON_PS, "live"))  # same record seen live and in the JSONL
    assert P.load_normalized([tmp_path], store, rebase=False)[0] == 0 and len(store.events) == 1


def test_cli_normalized_end_to_end(tmp_path):
    write_normalized(tmp_path / "in.jsonl", XMLS)
    out = tmp_path / "out"
    r = subprocess.run([sys.executable, str(BACKEND / "pipeline.py"), "--normalized", str(tmp_path / "in.jsonl"),
                        "--out", str(out)], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    assert "[normalized] 6 events from 1 file(s), 0 rejected" in r.stdout
    for name in ("detections", "actions", "endpoints", "stats"):
        assert json.loads((out / f"{name}.json").read_text(encoding="utf-8")) is not None


EVTX_DIR = os.environ.get("EVTX_SAMPLES")


@pytest.mark.skipif(not EVTX_DIR, reason="set EVTX_SAMPLES to a folder of public .evtx samples")
def test_public_evtx_samples_parse():
    """Manual check against public EVTX datasets (not committed): every record either parses
    to a valid contract record or is rejected for a stated reason; IDs are unique per file."""
    from Evtx.Evtx import Evtx
    import events
    files = sorted(Path(EVTX_DIR).rglob("*.evtx"))
    assert files
    for f in files:
        ids = set()
        with Evtx(str(f)) as log:
            for rec in log.records():
                r = events.from_xml(rec.xml(), "simulated", salt=f.name)
                if r is None:
                    continue
                assert events.validate(r, salt=f.name) == [], (f.name, r["id"])
                assert r["id"] not in ids
                ids.add(r["id"])
