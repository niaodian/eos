"""consent.py — per-purpose, versioned, revocable consent.

GDPR Art.6/7 (lawful basis; withdrawal as easy as giving); PIPL separate consent for
sensitive PI / cross-border (per-purpose flags, never a bundled all-or-nothing checkbox).

In-memory stub: swap ``_store`` for your DB table
    (subject_id, purpose, granted, basis, version, at) with the latest row per (subject, purpose).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from audit import AuditLog, audit


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ConsentStore:
    def __init__(self, log: AuditLog | None = None) -> None:
        self._store: dict[tuple[str, str], dict] = {}
        self.log = log if log is not None else audit()

    def grant(self, subject_id: str, purpose: str, *, basis: str = "consent", version: str = "v1") -> dict:
        """Record consent for ONE purpose. Separate purposes = separate consent (PIPL)."""
        rec = {"subjectId": subject_id, "purpose": purpose, "granted": True,
               "basis": basis, "version": version, "at": _now()}
        self._store[(subject_id, purpose)] = rec
        self.log.record(type="consent.grant", subjectId=subject_id, purpose=purpose,
                        version=version, basis=basis)
        return rec

    def revoke(self, subject_id: str, purpose: str) -> dict:
        """Withdrawal must be as easy as granting (GDPR Art.7(3)). No data logged, just the action."""
        rec = {"subjectId": subject_id, "purpose": purpose, "granted": False, "at": _now()}
        self._store[(subject_id, purpose)] = rec
        self.log.record(type="consent.revoke", subjectId=subject_id, purpose=purpose)
        return rec

    def check(self, subject_id: str, purpose: str) -> bool:
        """Gate a purpose-bound processing step on this."""
        rec = self._store.get((subject_id, purpose))
        return bool(rec and rec.get("granted") is True)

    def state(self, subject_id: str) -> dict[str, Any]:
        """Queryable consent state for a subject (feeds DSAR 'access' + your consent dashboard)."""
        return {p: rec for (s, p), rec in self._store.items() if s == subject_id}


def create_consent_store(log: AuditLog | None = None) -> ConsentStore:
    return ConsentStore(log)
