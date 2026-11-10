"""Normalize collector records into the normalised event contract v1 (docs/event_schema.md).

Field values come only from the event XML the collector saves ($e.ToXml() -> raw_xml), so
`data` keeps the real EventData/UserData field names. The rendered Message text is never
parsed: it is localised free text and loses the field names.
"""

import events

SCHEMA_VERSION = "1"


def normalize_event(raw_record, source="live", salt=""):
    """One collector record -> one contract record. Raises ValueError if it cannot be
    normalised without guessing (no XML, or no EventID / EventRecordID / TimeCreated)."""
    raw_xml = raw_record.get("raw_xml")
    if not raw_xml:
        raise ValueError("Record is missing raw_xml (the collector must save $e.ToXml())")

    record = events.from_xml(
        raw_xml, source, salt,
        host_fallback=raw_record.get("computer") or "unknown-host",
    )
    if record is None:
        raise ValueError(
            "raw_xml is not a usable Windows event "
            "(needs EventID, EventRecordID and TimeCreated)"
        )

    errors = events.validate(record, salt)
    if errors:
        raise ValueError("; ".join(errors))
    return record
