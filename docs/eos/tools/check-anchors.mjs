// TOC anchor checker — replicates github-slugger (the exact algorithm GitHub uses)
// so we verify links resolve on the hosted repo. Skips fenced code blocks.
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const src = readFileSync(file, 'utf8');
const lines = src.split('\n');

// github-slugger core (authoritative regex + dedup)
const RE = /[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,./:;<=>?@[\]^`{|}~]/g;
function baseSlug(value) {
  return value.toLowerCase().replace(RE, '').replace(/ /g, '-');
}
class Slugger {
  constructor() { this.occ = Object.create(null); }
  slug(value) {
    let result = baseSlug(value);
    const original = result;
    while (this.occ[result] !== undefined) {
      this.occ[original]++;
      result = original + '-' + this.occ[original];
    }
    this.occ[result] = 0;
    return result;
  }
}

// 1) collect headings, skipping fenced code blocks
const slugger = new Slugger();
const headings = []; // { level, text, anchor, line }
let inFence = false;
let fenceMark = '';
lines.forEach((ln, i) => {
  const fence = ln.match(/^\s*(```|~~~)/);
  if (fence) {
    if (!inFence) { inFence = true; fenceMark = fence[1]; }
    else if (ln.trim().startsWith(fenceMark)) { inFence = false; }
    return;
  }
  if (inFence) return;
  const h = ln.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
  if (h) {
    const level = h[1].length;
    const text = h[2].trim();
    headings.push({ level, text, anchor: slugger.slug(text), line: i + 1 });
  }
});
const anchorSet = new Set(headings.map((h) => h.anchor));

// 2) collect TOC links: lines like - [text](#anchor)
const tocLinks = [];
lines.forEach((ln, i) => {
  const m = ln.match(/\[([^\]]+)\]\(#([^)]+)\)/g);
  if (!m) return;
  for (const piece of m) {
    const mm = piece.match(/\[([^\]]+)\]\(#([^)]+)\)/);
    tocLinks.push({ text: mm[1], anchor: mm[2], line: i + 1 });
  }
});

// 3) report
let bad = 0;
console.log(`Headings found (outside code fences): ${headings.length}`);
console.log(`In-page TOC links found: ${tocLinks.length}\n`);
for (const t of tocLinks) {
  const ok = anchorSet.has(t.anchor);
  if (!ok) {
    bad++;
    // suggest closest by text
    const cand = headings.find((h) => h.text.replace(RE, '') === decodeURIComponent(t.text).replace(RE, ''))
      || headings.find((h) => h.text.includes(t.text.slice(0, 6)));
    console.log(`✗ L${t.line} "${t.text}"`);
    console.log(`    link → #${t.anchor}`);
    if (cand) console.log(`    want → #${cand.anchor}   (heading L${cand.line}: "${cand.text}")`);
    else console.log(`    want → (no matching heading found)`);
  }
}
if (bad === 0) {
  console.log('✓ ALL TOC ANCHORS RESOLVE');
} else {
  console.log(`\n✗ ${bad} broken anchor(s)`);
}

// 4) emit corrected TOC anchors for chapter/appendix headings (for auto-fix)
if (process.argv[3] === '--emit') {
  console.log('\n--- corrected anchors (level-1 headings) ---');
  for (const h of headings.filter((x) => x.level === 1)) {
    console.log(`${h.text}\t#${h.anchor}`);
  }
}
process.exit(bad === 0 ? 0 : 1);
