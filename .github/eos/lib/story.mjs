// Story parsing. A story is a Markdown file under docs/stories/ with front matter and an
// "Acceptance criteria" table. The parser is deliberately strict and structural: nothing here
// infers intent from prose, because prose is exactly what a gate must not be able to be talked past.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { posix } from './registry.mjs';
import { substantive } from './stage-record.mjs';

export const STORIES_DIR = 'docs/stories';
export const AC_ID = /^AC\d+\.\d+$/;
const EMPTY_CELL = /^(|—|-|–|n\/?a|tbd|todo|\?+)$/i;

function frontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function tableRows(text) {
  const rows = [];
  let inFence = false;
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (!/^\s*\|/.test(raw)) continue;
    const cells = raw.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length >= 2 && !cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
  }
  return rows;
}

function section(text, heading) {
  const re = new RegExp(`^#{2,6}\\s+${heading}\\s*$`, 'im');
  const m = text.match(re);
  if (!m) return null;
  const start = m.index + m[0].length;
  const rest = text.slice(start);
  const next = rest.search(/^#{2,6}\s+/m);
  return next === -1 ? rest : rest.slice(0, next);
}

/** @returns {{id, title, changeType, declaredState, path, acs, ops, dependencies, errors}} */
export function parseStory(root, rel) {
  const text = readFileSync(join(root, rel), 'utf8');
  const fm = frontMatter(text);
  const errors = [];
  const acs = [];
  for (const cells of tableRows(text)) {
    const [id, statement = '', testIntent = '', evalCase = ''] = cells;
    if (!AC_ID.test(id)) continue;
    acs.push({
      id,
      statement,
      testIntent: EMPTY_CELL.test(testIntent) ? '' : testIntent,
      evalCase: evalCase.trim(),
      evalDeclaredNotApplicable: /^n\/?a\b/i.test(evalCase.trim()) && evalCase.trim().length > 4,
    });
  }
  const opsText = section(text, 'Operational tasks') || '';
  const readOp = (label) => {
    const m = opsText.match(new RegExp(`^\\s*[-*]\\s*(?:${label})\\s*:\\s*(.+)$`, 'im'));
    return parseOpsDecision(m && m[1] ? m[1].trim() : '');
  };
  const depsText = section(text, 'Dependencies');
  return {
    id: fm.id || rel.split('/').pop().replace(/\.md$/, ''),
    title: fm.title || '',
    changeType: fm.changeType || null,
    classificationReason: fm.classificationReason || '',
    declaredState: fm.state || null,
    path: posix(rel),
    acs,
    ops: {
      telemetry: readOp('Telemetry'),
      authorization: readOp('Authoriz(?:ation|ed)|Authz'),
      rollback: readOp('Rollback'),
    },
    dependencies: depsText === null ? null : depsText.trim(),
    errors,
  };
}

/**
 * An operational decision on a story.
 *
 * EOS-AUD-005: `Telemetry: SKIP` used to count as a concrete task, because the parser only asked
 * whether the line had *any* value. Three shapes are accepted now, and each one carries the thing
 * that makes it a decision rather than an omission:
 *
 *   - Telemetry: ADOPT — emit auth.login.result; owner: @alice; verify: tests/login.test.mjs
 *   - Authorization: SKIP — single-user CLI: there is no principal to authorize
 *   - Rollback: DEFER — owner: @bob; trigger: before the first production deploy
 *
 * A bare value with no keyword is read as ADOPT, so the missing owner/verification is reported
 * precisely instead of the whole line being rejected as unparseable.
 *
 * @returns {{raw:string, decision:'ADOPT'|'SKIP'|'DEFER'|null, text:string, owner:string, verify:string, trigger:string}}
 */
export function parseOpsDecision(raw) {
  const empty = { raw: '', decision: null, text: '', owner: '', verify: '', trigger: '' };
  const value = (raw || '').trim();
  if (!value || EMPTY_CELL.test(value)) return empty;
  const kw = value.match(/^(ADOPT|SKIP|DEFER|N\/?A)\b[\s:—–-]*/i);
  const decision = kw ? { ADOPT: 'ADOPT', SKIP: 'SKIP', DEFER: 'DEFER', NA: 'SKIP', 'N/A': 'SKIP' }[kw[1].toUpperCase()] : 'ADOPT';
  const rest = kw ? value.slice(kw[0].length) : value;
  const clauses = rest.split(/[;|]/).map((c) => c.trim()).filter(Boolean);
  const field = (re) => {
    const hit = clauses.find((c) => re.test(c));
    return hit ? hit.replace(re, '').trim() : '';
  };
  const owner = field(/^owners?\s*[:=]\s*/i);
  const verify = field(/^(?:verify|verification|verified by|proof)\s*[:=]\s*/i);
  const trigger = field(/^triggers?\s*[:=]\s*/i);
  const text = clauses.filter((c) => !/^(?:owners?|verify|verification|verified by|proof|triggers?|due(?:By)?)\s*[:=]/i.test(c)).join('; ').trim();
  return { raw: value, decision, text, owner, verify, trigger };
}

/**
 * Why one operational decision is not yet a decision.
 * @returns {string|null}
 */
export function opsDecisionProblem(label, d) {
  if (!d || !d.decision) return `${label}: no decision recorded`;
  if (d.decision === 'SKIP') {
    return substantive(d.text, 15)
      ? null
      : `${label}: "SKIP" with no reason — record why this story genuinely does not need it (\`SKIP — <reason>\`, >= 15 characters of actual explanation)`;
  }
  if (d.decision === 'DEFER') {
    const missing = [];
    if (!substantive(d.owner, 1)) missing.push('owner');
    if (!substantive(d.trigger, 5)) missing.push('trigger');
    return missing.length ? `${label}: DEFER without ${missing.join(' and ')} (\`DEFER — owner: <who>; trigger: <what ends it>\`)` : null;
  }
  const missing = [];
  if (!substantive(d.text, 10)) missing.push('a concrete task');
  if (!substantive(d.owner, 1)) missing.push('owner: <who>');
  if (!substantive(d.verify, 3)) missing.push('verify: <how it is proven>');
  return missing.length ? `${label}: adopted but missing ${missing.join(', ')}` : null;
}

/** All stories, sorted by path so ordering is stable across platforms. */
export function listStories(root) {
  const dir = join(root, STORIES_DIR);
  if (!existsSync(dir)) return [];
  const out = [];
  (function walk(current, prefix) {
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = `${prefix}/${e.name}`;
      if (e.isDirectory()) { walk(join(current, e.name), rel); continue; }
      if (!e.name.endsWith('.md') || e.name === 'README.md') continue;
      try {
        if (statSync(join(current, e.name)).size === 0) continue;
        out.push(parseStory(root, rel));
      } catch (err) {
        // An unreadable / unparseable story must surface as a failing gate, never disappear.
        out.push({
          id: e.name.replace(/\.md$/, ''), title: '', changeType: null, classificationReason: '', declaredState: null,
          path: posix(rel), acs: [], ops: { telemetry: null, authorization: null, rollback: null },
          dependencies: null, errors: [`${posix(rel)}: could not be parsed (${err.message})`],
        });
      }
    }
  })(dir, STORIES_DIR);
  return out;
}

export const findStory = (stories, id) => stories.find((s) => s.id === id) || null;

/** Acceptance-criterion ids declared in the PRD. */
export function prdAcceptanceCriteria(root, rel = 'docs/prd.md') {
  const full = join(root, rel);
  if (!existsSync(full)) return { present: false, ids: [], defined: [], referenced: [], duplicates: [], blockers: [], sections: [] };
  const raw = readFileSync(full, 'utf8');
  // Fenced examples and HTML comments are not the specification. Scanning them made a commented-out
  // `- AC9.9 …` count as a definition, and made a `TBD` inside an illustrative block look like an
  // unresolved blocker. Strip them ONCE, then every scan below sees the same document.
  const text = raw
    .replace(/```[\s\S]*?```/g, '\n')
    .replace(/~~~[\s\S]*?~~~/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '\n');
  const referenced = [...new Set(text.match(/\bAC\d+\.\d+\b/g) || [])].sort();

  // EOS-AUD-004: "defined" used to include every mention, so a PRD that merely SAID "AC9.9" in a
  // sentence satisfied a story that claimed to implement AC9.9. A definition is now structural: the
  // id must OPEN a list item, a table cell or a heading — the three forms in which a document
  // actually states a criterion — and it must be followed by a statement.
  const DEFINITION = /^\s*(?:[-*+]\s+|\|\s*|#{1,6}\s+|\d+[.)]\s+)(AC\d+\.\d+)\b[\s:.—–)|-]*(.*)$/;
  const counts = new Map();
  const statements = new Map();
  const unstated = [];
  const sections = [];
  let current = { heading: '', acs: [], text: '' };
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#{1,6}\s+/.test(line)) {
      sections.push(current);
      current = { heading: line.replace(/^\s*#{1,6}\s+/, '').trim(), acs: [], text: '' };
    }
    current.text += line + '\n';
    const m = line.match(DEFINITION);
    if (!m) continue;
    const statement = m[2].replace(/\|/g, ' ').trim();
    // A row/bullet that names the id but says nothing is a placeholder, not a criterion.
    if (statement.length < 8) { unstated.push(m[1]); continue; }
    counts.set(m[1], (counts.get(m[1]) || 0) + 1);
    statements.set(m[1], statement);
    current.acs.push(m[1]);
  }
  sections.push(current);

  const blockers = text.split(/\r?\n/).filter((l) => /\b(BLOCKER|TBD|TODO)\b/.test(l));
  const defined = [...counts.keys()].sort();
  return {
    present: true,
    ids: defined,
    defined,
    referenced,
    statements,
    unstated: [...new Set(unstated)].filter((id) => !counts.has(id)),
    // A referenced-but-never-defined id is the fake-AC signature.
    referencedOnly: referenced.filter((id) => !counts.has(id)),
    duplicates: [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id),
    blockers,
    sections: sections.filter((s) => s.acs.length || s.text.trim()),
  };
}
