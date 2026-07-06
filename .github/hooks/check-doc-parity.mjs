#!/usr/bin/env node
// EOS documentation-parity checker — zero external deps.
// Enforces zh<->en doc parity ("English is the reference language"): every
// docs/eos/<f>.md has a docs/zh/<f>.md (+ README.md <-> README.zh.md), with
// matching STRUCTURE (headings / table-rows / code-fences) and matching FACTUAL
// CODES (S/G/P/D/R invariants + eos-x.y.z versions). Prose wording may differ per
// language; only structural or factual divergence is flagged. This is the gate that
// keeps the two language trees in lockstep, so an en-only edit can't silently drift.
// Run from project root: node .github/hooks/check-doc-parity.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const errors = [];
const warns = [];

// docs/eos/*.md that are intentionally English-only (no zh mirror required).
// Keep EMPTY unless a doc is genuinely en-only; every entry weakens the guarantee.
const EN_ONLY = new Set([]);
// docs/zh/*.md that legitimately have no docs/eos/ counterpart (zh-only navigation).
const ZH_ONLY = new Set(['README.md']);

const read = (p) => readFileSync(join(root, p), 'utf8');
const norm = (p) => p.split(/[\\/]/).join('/');

// --- structure fingerprint (fence-aware: skip fenced-code interiors) ---
// Counts real Markdown headings + table rows outside code fences, plus the number
// of fence delimiters (a proxy for "same set of code blocks"). Computed identically
// for en and zh, so parity => equal counts; any inequality is a structural drift.
function fingerprint(txt) {
  let headings = 0;
  let tableRows = 0;
  let fences = 0;
  let inFence = false;
  let mark = '';
  for (const ln of txt.split('\n')) {
    const f = ln.match(/^(```|~~~)/);
    if (f) {
      fences++;
      if (!inFence) { inFence = true; mark = f[1]; }
      else if (ln.startsWith(mark)) { inFence = false; }
      continue;
    }
    if (inFence) continue;
    if (/^#{1,6} /.test(ln)) headings++;
    if (/^\|/.test(ln)) tableRows++;
  }
  return { headings, tableRows, fences };
}

// --- factual code invariants (must stay verbatim across translation) ---
// Compared as SETS (presence), so incidental tokens shared by both languages cancel
// out and only true divergence (a code in one file but not the other) is reported.
const CODE_RE = /\b[SGPDR]\d{1,2}\b/g;
const VER_RE = /\beos-\d+\.\d+\.\d+\b/g;
function invariants(txt) {
  const s = new Set();
  for (const m of txt.match(CODE_RE) || []) s.add(m);
  for (const m of txt.match(VER_RE) || []) s.add(m);
  return s;
}
const only = (a, b) => [...a].filter((x) => !b.has(x)).sort();

// --- build the parity pair list ---
const pairs = [];
const eosDir = join(root, 'docs/eos');
const eosBases = new Set();
if (existsSync(eosDir)) {
  for (const f of readdirSync(eosDir).filter((n) => n.endsWith('.md')).sort()) {
    eosBases.add(f);
    if (!EN_ONLY.has(f)) pairs.push({ en: `docs/eos/${f}`, zh: `docs/zh/${f}`, label: f });
  }
}
// Root READMEs — explicit pair (different basenames).
pairs.push({ en: 'README.md', zh: 'README.zh.md', label: 'README' });

// --- coverage + parity, per pair ---
for (const { en, zh, label } of pairs) {
  if (!existsSync(join(root, en))) { warns.push(`missing EN source ${norm(en)} (pair ${label})`); continue; }
  if (!existsSync(join(root, zh))) {
    errors.push(`missing ZH mirror ${norm(zh)} — every ${norm(en)} needs a Chinese counterpart (parity is locked). Translate it, or add "${label}" to EN_ONLY with a reason.`);
    continue;
  }
  const et = read(en);
  const zt = read(zh);

  // parity banner present in zh (declares the contract to readers)
  if (!/英文为参照语言/.test(zt)) {
    warns.push(`${norm(zh)}: missing parity banner ("英文为参照语言 · English is the reference language")`);
  }

  // structure drift
  const ef = fingerprint(et);
  const zf = fingerprint(zt);
  const sd = [];
  if (ef.headings !== zf.headings) sd.push(`headings ${ef.headings}\u2260${zf.headings}`);
  if (ef.tableRows !== zf.tableRows) sd.push(`table-rows ${ef.tableRows}\u2260${zf.tableRows}`);
  if (ef.fences !== zf.fences) sd.push(`code-fences ${ef.fences}\u2260${zf.fences}`);
  if (sd.length) {
    errors.push(`${label}: structure drift (en vs zh) \u2014 ${sd.join(', ')}. A heading / table row / code block exists in one language but not the other; mirror the change.`);
  }

  // factual-code drift
  const ei = invariants(et);
  const zi = invariants(zt);
  const onlyEn = only(ei, zi);
  const onlyZh = only(zi, ei);
  if (onlyEn.length || onlyZh.length) {
    const bits = [];
    if (onlyEn.length) bits.push(`in EN not ZH: ${onlyEn.join(' ')}`);
    if (onlyZh.length) bits.push(`in ZH not EN: ${onlyZh.join(' ')}`);
    errors.push(`${label}: factual-code drift (${bits.join(' ; ')}). S/G/P/D/R codes + eos-x.y.z versions must match verbatim across languages.`);
  }
}

// --- reverse orphan check (zh docs with no en counterpart) ---
const zhDir = join(root, 'docs/zh');
if (existsSync(zhDir)) {
  for (const f of readdirSync(zhDir).filter((n) => n.endsWith('.md'))) {
    if (ZH_ONLY.has(f) || eosBases.has(f)) continue;
    warns.push(`docs/zh/${f}: no docs/eos/${f} counterpart (orphan zh doc? add the EN source, or list it in ZH_ONLY)`);
  }
}

// --- report (same shape as validate-config.mjs / eos-doctor.mjs) ---
console.log(`EOS doc-parity check \u2014 ${pairs.length} pair(s)\n`);
for (const w of warns) console.log('  WARN  ' + w);
for (const e of errors) console.log('  ERROR ' + e);
console.log('');
if (errors.length) {
  console.log(`FAIL: ${errors.length} error(s), ${warns.length} warning(s)`);
  process.exit(1);
}
console.log(`PASS${warns.length ? ` (${warns.length} warning(s))` : ''}`);
