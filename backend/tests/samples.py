"""Synthetic collector lines, shaped like collector.py output ($e.ToXml() in raw_xml).

Hand-written for tests; no data from a real machine. Kept inline because *.jsonl is
gitignored (no event data in the repo).
"""
import json
from xml.sax.saxutils import escape

EV_NS = "http://schemas.microsoft.com/win/2004/08/events/event"
HOST = "WIN11-LAB-01"
SYSMON = ("Microsoft-Windows-Sysmon", "{5770385f-c22a-43e0-bf4c-06f5698ffbd9}", "Microsoft-Windows-Sysmon/Operational")
SECURITY = ("Microsoft-Windows-Security-Auditing", "{54849625-5478-4994-a5ba-3e3b0328c30d}", "Security")


def event_xml(provider, eid, rec, body, t="2026-10-24T08:00:00.1234567Z", host=HOST):
    name, guid, channel = provider
    return (
        f"<Event xmlns='{EV_NS}'><System><Provider Name='{name}' Guid='{guid}'/>"
        f"<EventID>{eid}</EventID><Version>5</Version><Level>4</Level><Task>1</Task><Opcode>0</Opcode>"
        f"<Keywords>0x8000000000000000</Keywords><TimeCreated SystemTime='{t}'/>"
        f"<EventRecordID>{rec}</EventRecordID><Correlation/><Execution ProcessID='3112' ThreadID='4012'/>"
        f"<Channel>{channel}</Channel><Computer>{host}</Computer><Security UserID='S-1-5-18'/></System>"
        f"{body}</Event>"
    )


def event_data(fields):
    return "<EventData>" + "".join(f"<Data Name='{k}'>{escape(str(v))}</Data>" for k, v in fields) + "</EventData>"


def collector_line(xml, channel, eid, rec, message="(rendered message text)"):
    """One raw line exactly as collector.py writes it."""
    return json.dumps({
        "source_log": channel, "event_id": eid, "record_id": rec,
        "time_created": "2026-10-24T08:00:00.1234567+00:00", "provider": "", "computer": HOST,
        "message": message, "raw_xml": xml, "collected_at": "2026-10-24T09:00:00+01:00",
    })


ENC = "JABjAGwAaQBlAG4AdAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0AA=="
PS_FIELDS = [
    ("RuleName", "-"), ("UtcTime", "2026-10-24 08:00:00.123"),
    ("ProcessGuid", "{a1b2c3d4-0000-0000-0000-000000000001}"), ("ProcessId", "7724"),
    ("Image", r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"),
    ("CommandLine", f'"powershell.exe" -nop -w hidden -enc {ENC}'),
    ("User", r"LAB\demo.analyst"),
    ("ParentImage", r"C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE"),
    ("Hashes", "SHA256=0000000000000000000000000000000000000000000000000000000000000000"),
]
SYSMON_PS = event_xml(SYSMON, 1, 101, event_data(PS_FIELDS))

SEC_4688 = event_xml(SECURITY, 4688, 202, event_data([
    ("SubjectUserName", "demo.analyst"), ("NewProcessId", "0x1f4c"),
    ("NewProcessName", r"C:\Windows\System32\schtasks.exe"),
    ("CommandLine", r'schtasks /create /tn upd /tr "powershell -w hidden C:\Users\Public\u.ps1" /ru SYSTEM'),
    ("ParentProcessName", r"C:\Windows\System32\cmd.exe"), ("TokenElevationType", "%%1937"),
]))

SEC_4625 = event_xml(SECURITY, 4625, 303, event_data([
    ("TargetUserName", "administrator"), ("LogonType", "3"), ("IpAddress", "10.0.0.66"), ("IpPort", "51234"),
]))

SYSMON_DNS = event_xml(SYSMON, 22, 404, event_data([
    ("ProcessId", "5120"), ("QueryName", "login-0ffice.net"), ("QueryStatus", "0"),
    ("Image", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
]))

SYSMON_NET = event_xml(SYSMON, 3, 405, event_data([
    ("Image", r"C:\Users\Public\x.exe"), ("ProcessId", "555"), ("DestinationIp", "203.0.113.7"),
    ("DestinationPort", "443"), ("DestinationHostname", "cdn-update-sync.top"),
]))

SYSMON_EICAR = event_xml(SYSMON, 11, 406, event_data([
    ("Image", r"C:\Windows\System32\cmd.exe"), ("TargetFilename", r"C:\Users\demo\Desktop\eicar.com"),
]))

# Security log cleared: fields live in UserData, not EventData.
LOG_CLEARED = event_xml(
    ("Microsoft-Windows-Eventlog", "{fc65ddd8-d6ef-4962-83d5-6e5cfe9ce148}", "Security"), 1102, 507,
    "<UserData><LogFileCleared xmlns='http://manifests.microsoft.com/win/2004/08/windows/eventlog'>"
    "<SubjectUserSid>S-1-5-21-1-2-3-1001</SubjectUserSid><SubjectUserName>demo.analyst</SubjectUserName>"
    "<SubjectDomainName>LAB</SubjectDomainName></LogFileCleared></UserData>",
)

# Classic provider: unnamed <Data> plus <Binary>.
CLASSIC = event_xml(
    ("MsiInstaller", "", "Application"), 1033, 608,
    "<EventData><Data>Contoso Agent</Data><Data>1.2.3</Data><Data>1033</Data><Binary>7B4142437D</Binary></EventData>",
)

REPEATED = event_xml(SYSMON, 1, 709, event_data([("Image", r"C:\a.exe"), ("Tag", "one"), ("Tag", "two")]))
