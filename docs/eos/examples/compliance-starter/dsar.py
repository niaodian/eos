"""dsar.py — Data Subject Access Requests: export (access/portability) + erase (right to erasure).

GDPR Art.15/17/20 · PIPL 45/47. Landing point: data-api "Support subject deletion / export
where PII is stored (GDPR/CCPA-style 'right to erasure/access')" + "Every deletion … is audited".

A ``source`` is any object exposing ``name`` + ``export(subject_id)`` + ``erase(subject_id)`` —
register one adapter per table/service. This is the pluggable "your data" seam.
Handlers are synchronous here for a zero-dep stdlib skeleton; wrap in your framework's
async/await or a task queue if exports are large.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Protocol

from audit import AuditLog, audit


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Source(Protocol):
    name: str

    def export(self, subject_id: str) -> Any: ...

    def erase(self, subject_id: str) -> int: ...


def export_subject(subject_id: str, sources: list[Source], log: AuditLog | None = None) -> dict:
    """Access + Portability: structured, machine-readable bundle (GDPR Art.20)."""
    log = log if log is not None else audit()
    data = {s.name: s.export(subject_id) for s in sources}
    log.record(type="dsar.export", subjectId=subject_id, sources=[s.name for s in sources])
    return {"subjectId": subject_id, "generatedAt": _now(), "data": data}


def erase_subject(subject_id: str, sources: list[Source], *, reason: str = "dsar.erasure",
                  log: AuditLog | None = None) -> dict:
    """Right to erasure. Returns an audit-friendly record of WHAT was erased WHERE (not the data)."""
    log = log if log is not None else audit()
    erased = {s.name: s.erase(subject_id) for s in sources}
    # Backups inherit the same rule: re-run erasure on restore, or document the retention window
    # and encryption so restored data self-expires. (.github/instructions/data-api)
    log.record(type="dsar.erase", subjectId=subject_id, reason=reason, erased=erased)
    return {"subjectId": subject_id, "erasedAt": _now(), "reason": reason, "erased": erased}
