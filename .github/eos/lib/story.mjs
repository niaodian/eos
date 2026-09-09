// Story parsing. A story is a Markdown file under docs/stories/ with front matter and an
// "Acceptance criteria" table. The parser is deliberately strict and structural: nothing here
// infers intent from prose, because prose is exactly what a gate must not be able to be talked past.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { posix } from './registry.mjs';

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
    const value = m && m[1] ? m[1].trim() : '';
    return value && !EMPTY_CELL.test(value) ? value : '';
  };
  const depsText = section(text, 'Dependencies');
  return {
    id: fm.id || rel.split('/').pop().replace(/\.md$/, ''),
    title: fm.title || '',
    changeType: fm.changeType || null,
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
          id: e.name.replace(/\.md$/, ''), title: '', changeType: null, declaredState: null,
          path: posix(rel), acs: [], ops: { telemetry: '', authorization: '', rollback: '' },
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
  if (!existsSync(full)) return { present: false, ids: [], duplicates: [], blockers: [] };
  const text = readFileSync(full, 'utf8');
  const found = text.match(/\bAC\d+\.\d+\b/g) || [];
  const counts = new Map();
  // "Defined" means the id starts a statement (list item, table cell or heading); a mention inside
  // a sentence is a reference, not a second definition.
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:[-*+]\s+|\|\s*|#{1,6}\s+)?(AC\d+\.\d+)\b/);
    if (m) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  }
  const blockers = text.split(/\r?\n/).filter((l) => /\b(BLOCKER|TBD|TODO)\b/.test(l) && !/^\s*<!--/.test(l));
  return {
    present: true,
    ids: [...new Set(found)].sort(),
    defined: [...counts.keys()].sort(),
    duplicates: [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id),
    blockers,
  };
}
