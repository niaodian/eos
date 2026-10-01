// Policy upstream adapter — the one place EOS reaches the network on its own initiative (ADR-013).
//
// `eos policy sync` fetches an organization's policy baseline through this module and nothing else.
// Every verification command — `policy check`, gates, `verify` — reads the copy sync vendored, so
// they stay offline. The source may be:
//   https://…            the normal case
//   http://127.0.0.1/…   loopback only — for tests and local mirrors; plain http elsewhere is refused,
//                        because a baseline decides which gates run
//   file:… or a path     an air-gapped or monorepo checkout of the organization's policy repository
// Redirects are refused rather than followed, so a 302 can never move the source to plain http.
// Nothing here reads a credential: a private policy repository is followed through a local
// checkout (file:), whose access is git's business, not EOS's.
import { readFileSync, existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/**
 * @returns {Promise<{text?: string, error?: string, blocked?: boolean}>} `blocked` = could not be
 *   reached (try again later); otherwise an error is a misconfiguration.
 */
export async function fetchBaseline(root, source, { timeoutMs = 15000 } = {}) {
  if (typeof source !== 'string' || !source) return { error: 'policyUpstream.source is not declared', blocked: false };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(source) && !/^file:/i.test(source)) {
    let url;
    try { url = new URL(source); } catch { return { error: `"${source}" is not a valid URL`, blocked: false }; }
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK.has(url.hostname))) {
      return { error: `refusing ${url.protocol}//${url.host} — a policy baseline decides which gates run, so it is fetched over https (plain http only on loopback)`, blocked: false };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'error', headers: { accept: 'application/json' } });
      if (!res.ok) return { error: `${url.host} answered HTTP ${res.status}`, blocked: res.status >= 500 };
      return { text: await res.text() };
    } catch (e) {
      const why = e.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : (e.cause?.code || e.message);
      return { error: `could not reach ${url.host}: ${why}`, blocked: true };
    } finally {
      clearTimeout(timer);
    }
  }
  const path = /^file:\/\//i.test(source) ? fileURLToPath(source) : source.replace(/^file:/i, '');
  const full = isAbsolute(path) ? path : resolve(root, path);
  if (!existsSync(full)) return { error: `${source} does not exist here`, blocked: true };
  return { text: readFileSync(full, 'utf8') };
}
