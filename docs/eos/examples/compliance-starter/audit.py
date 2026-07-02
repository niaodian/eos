"""audit.py — append-only who/when/what trail shared by consent + DSAR.

Landing point: data-api "Every deletion of user data is audited (who/when/what),
without logging the data itself." (.github/instructions/data-api/20-data-api.instructions.md)

Stub: swap the in-memory list for a WORM store / append-only audit table.
NEVER write raw PII here — log identifiers + action, not the personal data.
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import MappingProxyType
from typing import Any


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AuditLog:
    def __init__(self) -> None:
        self._entries: list[MappingProxyType] = []

    def record(self, **entry: Any) -> MappingProxyType:
        e = MappingProxyType({"at": _now(), **entry})  # read-only entry
        self._entries.append(e)
        return e

    def all(self) -> list[MappingProxyType]:
        return list(self._entries)  # copy — callers can't mutate the trail


def audit() -> AuditLog:
    return AuditLog()
