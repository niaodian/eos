"""The model behind an agent — provider-agnostic, stdlib only, recordable (twin of ../model.mjs).

A model is one function: complete(messages, temperature, seed) -> {"text", "usage", "latencyMs", "model"}.
EVAL_MODE: live | record | replay | auto (live with a key, replay without — the default). A replayed
run proves the graders against RECORDED answers, so run_eval.py marks its summary unattested.

The key comes from an environment variable (a CI secret in CI), is sent only in the Authorization
header, and is never logged or written to a cassette. A cassette is shared with the Node twin: the
request key is the same canonical JSON, so one recording replays in both.
"""
import hashlib
import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

MODES = ("live", "record", "replay", "auto")


def request_key(request):
    canonical = json.dumps(request, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class OpenAICompatible:
    """OpenAI, Azure OpenAI's v1 surface, OpenRouter, DeepSeek, DashScope compatible mode, Ollama, vLLM …"""

    provider = "openai-compatible"

    def __init__(self, model=None, base_url=None, api_key_env="OPENAI_API_KEY", timeout=60, retries=2):
        self.model = model or os.environ.get("EVAL_MODEL")
        self.base_url = (base_url or os.environ.get("OPENAI_BASE_URL") or "https://api.openai.com/v1").rstrip("/")
        self.api_key_env = api_key_env
        self.timeout = timeout
        self.retries = retries

    def has_key(self):
        return bool(os.environ.get(self.api_key_env))

    def complete(self, messages, temperature=0, seed=None):
        if not self.model:
            raise RuntimeError("set EVAL_MODEL to the model your product calls — the eval records it")
        key = os.environ.get(self.api_key_env)
        if not key:
            raise RuntimeError(f"{self.api_key_env} is not set — live calls need it (in CI: a repository secret)")
        payload = {"model": self.model, "messages": messages, "temperature": temperature, "response_format": {"type": "json_object"}}
        if seed is not None:
            payload["seed"] = seed
        body = json.dumps(payload).encode("utf-8")
        for attempt in range(self.retries + 1):
            started = time.monotonic()
            req = urllib.request.Request(f"{self.base_url}/chat/completions", data=body, method="POST",
                                         headers={"content-type": "application/json", "authorization": f"Bearer {key}"})
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as res:
                    text = res.read().decode("utf-8", "replace")
                try:
                    data = json.loads(text)
                except ValueError:
                    raise RuntimeError(f"{self.base_url}/chat/completions answered 200 but not with JSON — this is not a model endpoint: {' '.join(text.split())[:120]}") from None
            except urllib.error.HTTPError as e:
                # Bounded retry with backoff on rate limits and server errors; everything else is final.
                if (e.code == 429 or e.code >= 500) and attempt < self.retries:
                    time.sleep(0.5 * 2 ** attempt)
                    continue
                raise RuntimeError(f"{self.base_url} answered {e.code}: {e.read().decode('utf-8', 'replace')[:200]}") from None
            # A 200 is not an answer: a gateway or a login page answers 200 too. Only a chat-completions
            # document is the model.
            if not isinstance(data, dict) or not isinstance(data.get("choices"), list) or not data["choices"] or not (data["choices"][0] or {}).get("message"):
                raise RuntimeError(f"{self.base_url}/chat/completions answered 200 but not with a chat-completions JSON (no choices[0].message) — this is not a model endpoint")
            usage = data.get("usage") or {}
            return {
                "text": ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "",
                "usage": {"inputTokens": usage.get("prompt_tokens", 0), "outputTokens": usage.get("completion_tokens", 0)},
                "latencyMs": int((time.monotonic() - started) * 1000),
                "model": data.get("model") or self.model,
            }
        raise RuntimeError("unreachable")


def resolve_mode(model, requested=None):
    requested = requested or os.environ.get("EVAL_MODE") or "auto"
    if requested not in MODES:
        raise ValueError(f"EVAL_MODE must be one of {', '.join(MODES)} (got {requested!r})")
    if requested != "auto":
        return requested
    return "live" if model.has_key() else "replay"


class Cassette:
    """record adds every exchange; replay answers only from the tape and fails on anything new."""

    def __init__(self, model, path, mode=None):
        self.inner = model
        self.path = Path(path)
        self.mode = mode or resolve_mode(model)
        if self.mode == "replay" and not self.path.exists():
            raise FileNotFoundError(f"EVAL_MODE=replay but there is no cassette at {self.path} — record one with a key: EVAL_MODE=record")
        tape = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else {"entries": []}
        self.tape_model = tape.get("model")
        # A recording starts from an empty tape, so the cassette holds exactly what this run asked.
        # `requestSha256` is the field's name since eos-2.6.0; `key` (older cassettes) is still read.
        self.usage_comparable = tape.get("usageComparable")
        self.entries = {} if self.mode == "record" else {e.get("requestSha256") or e["key"]: e for e in tape.get("entries", [])}
        self.provider = model.provider
        self.model = self.tape_model if self.mode == "replay" else model.model

    def cassette(self):
        info = {"path": self.path.as_posix(), "version": hashlib.sha256(self.path.read_bytes()).hexdigest()[:12]}
        if self.usage_comparable is False:
            info["usageComparable"] = False  # answers came through a relay: token counts and latency are not the provider's
        return info

    def complete(self, messages, temperature=0, seed=None):
        request = {"model": self.model, "messages": messages, "temperature": temperature, "seed": seed}
        key = request_key(request)
        if self.mode == "replay":
            hit = self.entries.get(key)
            if not hit:
                raise LookupError(f"no recorded answer for this request in {self.path} — the prompt, the model or the parameters changed since it was recorded; re-record with a key (EVAL_MODE=record)")
            return {**hit["response"], "model": self.tape_model}
        response = self.inner.complete(messages, temperature, seed)
        if self.mode == "record":
            self.entries[key] = {"requestSha256": key, "request": request, "response": {k: response[k] for k in ("text", "usage", "latencyMs")}}
        return response

    def save(self):
        if self.mode != "record":
            return None
        out = {"schemaVersion": 1, "provider": self.provider, "model": self.inner.model,
               "recordedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
               **({"usageComparable": False} if getattr(self.inner, "usage_comparable", None) is False else {}),
               "entries": sorted(self.entries.values(), key=lambda e: e["requestSha256"])}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return self.path
