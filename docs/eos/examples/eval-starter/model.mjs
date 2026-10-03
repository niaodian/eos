// The model behind an agent — provider-agnostic, zero dependencies, recordable. (P1-6)
//
// A model here is one function: `complete({ messages, temperature, seed }) → { text, usage, latencyMs, model }`.
// Your agent depends on that shape, never on a vendor SDK, so swapping providers changes one line.
//
// Modes (EVAL_MODE, or the `mode` option):
//   live    call the provider on every request
//   record  call the provider, and save every exchange to a cassette (commit it)
//   replay  answer from the cassette only — no key, no network; a request it has not seen FAILS
//   auto    live when the key is set, replay otherwise (the default)
//
// A replayed run proves the graders and thresholds against RECORDED answers, not against the model
// as it is today. The runner therefore marks its summary unattested (producer "local", even in CI),
// so a release whose evidencePolicy requires CI evidence cannot rest on it.
//
// Security: the key is read from an environment variable (a CI secret in CI), sent only in the
// Authorization header, and never logged or written to a cassette. A cassette stores the prompts and
// the answers — record with the dataset, never with production data.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const MODES = ['live', 'record', 'replay', 'auto'];

/** Stable JSON: the cassette key must not depend on key order. */
const canonical = (v) => (Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
    : JSON.stringify(v));

/** What identifies a request: the model, the messages and the sampling parameters. */
export const requestKey = (request) => createHash('sha256').update(canonical(request)).digest('hex');

/**
 * An OpenAI-compatible chat-completions endpoint: OpenAI, Azure OpenAI's v1 surface, OpenRouter,
 * DeepSeek, DashScope compatible mode, or a local Ollama / vLLM / LM Studio (`http://localhost:11434/v1`).
 */
export function openaiCompatible({
  model = process.env.EVAL_MODEL,
  baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  apiKeyEnv = 'OPENAI_API_KEY',
  timeoutMs = 60000,
  retries = 2,
} = {}) {
  return {
    provider: 'openai-compatible',
    model,
    hasKey: () => !!process.env[apiKeyEnv],
    async complete({ messages, temperature = 0, seed }) {
      if (!model) throw new Error('set EVAL_MODEL to the model your product calls (e.g. the deployment name) — the eval records it');
      const key = process.env[apiKeyEnv];
      if (!key) throw new Error(`${apiKeyEnv} is not set — live calls need it (in CI: a repository secret)`);
      const body = JSON.stringify({ model, messages, temperature, ...(seed !== undefined ? { seed } : {}), response_format: { type: 'json_object' } });
      for (let attempt = 0; ; attempt++) {
        const started = Date.now();
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
        // Bounded retry with backoff on rate limits and server errors; everything else is final.
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
          continue;
        }
        if (!res.ok) throw new Error(`${baseUrl} answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const json = await res.json();
        return {
          text: json.choices?.[0]?.message?.content ?? '',
          usage: { inputTokens: json.usage?.prompt_tokens ?? 0, outputTokens: json.usage?.completion_tokens ?? 0 },
          latencyMs: Date.now() - started,
          model: json.model || model,
        };
      }
    },
  };
}

/** The mode in force: EVAL_MODE, or auto (live with a key, replay without). */
export function resolveMode(model, requested = process.env.EVAL_MODE || 'auto') {
  if (!MODES.includes(requested)) throw new Error(`EVAL_MODE must be one of ${MODES.join(', ')} (got "${requested}")`);
  if (requested !== 'auto') return requested;
  return model.hasKey() ? 'live' : 'replay';
}

/**
 * Wrap a model with a cassette. `record` adds every exchange; `replay` answers only from it.
 * @returns the same `complete` shape, plus `mode`, `cassette()` and `save()`
 */
export function withCassette(model, { path, mode = resolveMode(model) }) {
  const tape = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8'))
    : { schemaVersion: 1, provider: model.provider, model: model.model || null, entries: [] };
  // A recording starts from an empty tape, so the cassette holds exactly what this run asked.
  const byKey = new Map(mode === 'record' ? [] : tape.entries.map((e) => [e.key, e]));
  if (mode === 'replay' && !existsSync(path)) throw new Error(`EVAL_MODE=replay but there is no cassette at ${path} — record one with a key: EVAL_MODE=record`);
  return {
    provider: model.provider,
    model: mode === 'replay' ? tape.model : model.model,
    mode,
    cassette: () => ({ path, version: createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 12) }),
    async complete(params) {
      const request = { model: mode === 'replay' ? tape.model : model.model, messages: params.messages, temperature: params.temperature ?? 0, seed: params.seed ?? null };
      const key = requestKey(request);
      if (mode === 'replay') {
        const hit = byKey.get(key);
        // Fail closed: a prompt, model or parameter change since the recording means the cassette
        // no longer answers THIS request, and inventing an answer would grade nothing real.
        if (!hit) throw new Error(`no recorded answer for this request in ${path} — the prompt, the model or the parameters changed since it was recorded; re-record with a key (EVAL_MODE=record)`);
        return { ...hit.response, model: tape.model };
      }
      const response = await model.complete(params);
      if (mode === 'record') {
        const entry = { key, request, response: { text: response.text, usage: response.usage, latencyMs: response.latencyMs } };
        byKey.set(key, entry);
      }
      return response;
    },
    save() {
      if (mode !== 'record') return null;
      const out = { schemaVersion: 1, provider: model.provider, model: model.model, recordedAt: new Date().toISOString(), entries: [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key)) };
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
      return path;
    },
  };
}
