// The local test-duration trend behind `eos health`.
//
// run-tests.mjs appends one line per run to .eos/local/test-history.jsonl. It is gitignored and
// machine-local on purpose: a laptop's timings are not evidence about anyone else's machine, and the
// CI baseline in .eos/test-budget.json is the enforced number. This file only answers the question a
// developer actually asks — "is the suite getting slower on MY machine, and since when?".
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const TEST_HISTORY_PATH = '.eos/local/test-history.jsonl';
const WINDOW = 5;

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

/**
 * Per layer: the latest time, the median of the last WINDOW runs, the median of the WINDOW before
 * that, and the change between the two. Medians, not means: one run during a backup or a video call
 * should not read as a regression.
 */
export function testDurationTrend(root) {
  const full = join(root, TEST_HISTORY_PATH);
  if (!existsSync(full)) return { runs: 0, layers: {} };
  const runs = [];
  for (const line of readFileSync(full, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { runs.push(JSON.parse(line)); } catch { /* a torn line is skipped, never fatal */ }
  }
  const names = [...new Set(runs.flatMap((r) => Object.keys(r.layers || {})))];
  const layers = {};
  for (const name of names) {
    const series = runs.map((r) => r.layers?.[name]).filter((ms) => typeof ms === 'number');
    if (!series.length) continue;
    const recent = series.slice(-WINDOW);
    const previous = series.slice(-2 * WINDOW, -WINDOW);
    const recentMedianMs = median(recent);
    const previousMedianMs = median(previous);
    layers[name] = {
      samples: series.length,
      latestMs: series.at(-1),
      recentMedianMs,
      previousMedianMs,
      changePct: previousMedianMs ? Math.round(((recentMedianMs - previousMedianMs) / previousMedianMs) * 100) : null,
    };
  }
  return { runs: runs.length, layers };
}
