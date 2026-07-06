# Contributing to EOS

Thanks for your interest in improving the **Engineering Operating System (EOS)** template — a portable,
**local-first** setup of rules, prompts, agents, hooks, and docs for VS Code + GitHub Copilot that
orchestrates the installed **BMAD** skills across the SDLC.

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Guiding principles (please read before proposing changes)

These are the beliefs the template is built on. Changes are easiest to accept when they respect them:

- **Local-first, zero enterprise dependency.** The main path must work offline with no org/network
  backend. Anything needing network or an enterprise service is an *optional extension*, clearly marked —
  never the default path.
- **Reuse-first.** EOS orchestrates the 73 installed `bmad-*` skills. Prefer reusing an existing skill
  over inventing a new capability. Tag new artifacts honestly as reuse / new / hybrid.
- **English is the reference language; Chinese is kept in parity.** All config and docs are authored in
  English — the tie-breaker when a translation is ambiguous. Every `docs/eos/<f>.md` has a `docs/zh/<f>.md`
  mirror kept in **content parity** (and `README.md` ⇄ `README.zh.md`). If you edit an English doc, mirror
  the change to its Chinese counterpart **in the same PR** — CI's `check-doc-parity.mjs` enforces matching
  structure + factual codes, so an en-only edit fails the build.
- **Anti-hallucination.** Every feature, filename, YAML key, or setting you document must match the
  official VS Code + GitHub Copilot docs. If a mechanism is Preview/experimental or version-dependent,
  say so. Do not claim a native rule-*priority* mechanism — multiple instruction files merge in an
  unspecified order; any ordering is a team convention.
- **Verify, don't trust.** Any claim about how a tool, regex, or hook behaves must be reproduced
  empirically (an isolated test) before you assert it in code or docs.
- **Two paradigms, isolated.** EOS supports deterministic *SaaS* and probabilistic *Agentic/LLM* projects
  and keeps them explicitly separate. Don't let one paradigm's assumptions leak into the other.

---

## Prerequisites

- **Node.js 18+** — the only hard dependency (runs the validators, hooks, tests, and evals).
- *Optional:* Docker + [`act`](https://github.com/nektos/act) to run the CI workflow locally;
  [`gitleaks`](https://github.com/gitleaks/gitleaks) for deeper secret scanning. Both degrade gracefully
  if absent.

See [`docs/eos/quickstart.md`](docs/eos/quickstart.md) for the full local setup.

---

## Development workflow

EOS is **spec-driven** — it practices what it preaches. Don't skip gates:

```
discovery → requirements → PRD → UX → architecture → stories → code
```

- Specs in `docs/` are the single source of truth; never implement beyond the approved spec.
- For most template contributions you'll touch one layer: a rule (`.github/instructions/`), a prompt
  (`.github/prompts/`), an agent (`.github/agents/`), a hook (`.github/hooks/`), or docs (`docs/`).
- Start from an issue (bug report or proposal) so the change has a clear, agreed scope.

### Naming & style
- **PascalCase** for types/interfaces/components, **camelCase** for vars/functions, **ALL_CAPS** for
  constants.
- Comment only what needs clarifying; let clear code speak for itself.

### Security red lines (never cross)
- Never hardcode secrets; never log PII/credentials; never disable authz "to make it work".
- Validate & sanitize external input at boundaries. See [`SECURITY.md`](SECURITY.md).

### Operational awareness
- Every user-facing feature should consider **telemetry, authz, and rollback**. If one is skipped, say
  why in the PR (the PR template prompts for this).

---

## Verification gates (run before every PR)

Authority is CI, but run these locally first — they're fast and offline:

```sh
node .github/hooks/validate-config.mjs            # S1–S11 config validation (must PASS)
node .github/hooks/check-doc-parity.mjs           # zh⇄en doc parity — lockstep (must PASS)
node .github/hooks/eos-doctor.mjs                 # SDLC gate + secret-hygiene advisories (exit 0)
git add -A && node .github/hooks/secret-scan.mjs  # tracked-file secret scan (must be clean)
node --test .github/hooks/deny-dangerous.test.mjs # guardrail invariants (must pass)
```

If you changed the user manual, also run:

```sh
node docs/eos/tools/check-anchors.mjs docs/eos/user-manual.md
```

`docs/eos/user-manual.md` is the primary PDF source and the one with a full Table of Contents: adding a
new top-level `#` appendix requires a matching Table-of-Contents line or `check-anchors` fails.
(`build-pdf.sh` can render any doc — incl. `docs/zh/*.md` — to a CJK-safe PDF; the manual is just the
one whose TOC must stay in sync.)

You can run the whole batch gate the way CI does (needs Docker): `act push -j verify --pull=false`.

---

## Commit & PR conventions

- **[Conventional Commits](https://www.conventionalcommits.org/)**: `feat: …`, `fix: …`, `docs: …`,
  `chore: …`, etc.
- **Branch names**: `feat/<story-id>-slug` (or `fix/…`, `docs/…`).
- **One story / one concern per PR.** Keep PRs small and reviewable.
- If the work was Copilot-assisted, include the trailer:

  ```
  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
  ```

- Fill out the PR template, including the verification-gate checklist.

---

## Reporting bugs & requesting features

- **Bugs / proposals:** open an issue using the provided forms.
- **Questions / usage help:** please use Discussions (or the issue-chooser link) rather than the bug
  tracker.
- **Security vulnerabilities:** do **not** open a public issue — follow [`SECURITY.md`](SECURITY.md).

---

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE) that
covers this project.
