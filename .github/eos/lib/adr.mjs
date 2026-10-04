// What an ADR says about who confirmed it (eos-2.6.0, ADR-023).
//
// An architecture decision that cannot be undone — a tech stack, a topology, a data model — is a
// one-way door. EOS cannot tell "decided" from "a person confirmed it": an agent running unattended
// writes the ADR itself. The ADR therefore carries, written by a person:
//   - Status: proposed | accepted | superseded
//   - Confirmed by: <name>
//   - Confirmed at: YYYY-MM-DD
// G4 passes with a proposed ADR (so unattended development is not stopped in the architecture stage)
// and says so; `release-ready` refuses to ship until each one-way door is accepted and confirmed.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const STATUS_LINE = /^[ \t]*(?:[-*][ \t]*)?\**Status\**[ \t]*:[ \t]*\**([A-Za-z]+)/im;
const STATUS_HEADING = /^#{1,6}[ \t]*Status[ \t]*\r?\n+[ \t]*(?:[-*][ \t]*)?([A-Za-z]+)/im;
const CONFIRMED_BY = /^[ \t]*(?:[-*][ \t]*)?\**Confirmed[ _-]?by\**[ \t]*:[ \t]*\**([^\r\n*]+)/im;
const CONFIRMED_AT = /^[ \t]*(?:[-*][ \t]*)?\**Confirmed[ _-]?at\**[ \t]*:[ \t]*\**(\d{4}-\d{2}-\d{2})/im;

/** @returns {{present: boolean, status: string|null, confirmedBy: string|null, confirmedAt: string|null}} */
export function readAdrConfirmation(root, rel) {
  const full = join(root, rel);
  if (!existsSync(full)) return { present: false, status: null, confirmedBy: null, confirmedAt: null };
  const text = readFileSync(full, 'utf8');
  const status = (STATUS_LINE.exec(text) || STATUS_HEADING.exec(text))?.[1]?.toLowerCase() ?? null;
  const by = CONFIRMED_BY.exec(text)?.[1]?.trim() || null;
  return { present: true, status, confirmedBy: by && !/^(?:tbd|todo|none|n\/a|—|-)$/i.test(by) ? by : null, confirmedAt: CONFIRMED_AT.exec(text)?.[1] ?? null };
}

/** The decisions in an architecture record that are DECIDED and carry an ADR: the one-way doors. */
export function oneWayDoors(record) {
  return Object.entries(record?.decisions || {})
    .filter(([, d]) => d?.status === 'DECIDED' && typeof d.adr === 'string' && d.adr)
    .map(([key, d]) => ({ key, adr: d.adr }));
}
