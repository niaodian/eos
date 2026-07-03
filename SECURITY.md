# Security Policy

EOS is a **local-first** engineering-operating-system template (rules, prompts, agents, hooks, and docs
for VS Code + GitHub Copilot). It has no server, no network backend, and no runtime service. The security
surface is therefore the **scripts and configuration shipped in this repository** — chiefly the Node hooks
under `.github/hooks/` and the CI workflow — plus the guidance the template gives downstream projects.

## Supported versions

This is a rolling template; only the latest tagged version receives fixes.

| Version | Supported |
|---|---|
| Latest release (see `docs/eos/VERSION`) | ✅ |
| Older tags | ❌ (upgrade to latest) |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately via GitHub Security Advisories:
**[Security → Report a vulnerability](https://github.com/niaodian/eos-template/security/advisories/new)**
(the repository's *Security* tab → *Report a vulnerability*).

If private reporting is unavailable to you, contact the maintainer
[@niaodian](https://github.com/niaodian) through GitHub and ask for a private channel.

When reporting, please include:
- affected file(s) / script(s) and version (`docs/eos/VERSION`),
- a minimal reproduction (commands or Copilot Chat steps),
- impact and any suggested remediation.

**Never include secrets, tokens, credentials, or personal data in a report.** If a real secret has leaked,
rotate it first, then report.

### What to expect
This template is maintained on a best-effort basis by an individual. Expect an initial acknowledgement
within a few days. Valid reports will be fixed in the latest version and credited (unless you prefer to
remain anonymous) via a GitHub Security Advisory.

## Scope

**In scope**
- The hooks/validators in `.github/hooks/` (e.g. `validate-config.mjs`, `eos-doctor.mjs`,
  `secret-scan.mjs`, `deny-dangerous.js`, `quality.mjs`).
- The CI workflow in `.github/workflows/`.
- Template guidance that could lead a downstream project into an insecure default.

**Out of scope**
- Vulnerabilities in **your** application code generated while *using* EOS — those belong to your project.
- Third-party tools EOS merely references (Node.js, `gitleaks`, `act`, BMAD skills, etc.) — report upstream.
- Issues requiring a non-default, unsupported configuration.

## Built-in security hygiene

EOS ships local guardrails you can (and should) run before every commit:
- `node .github/hooks/secret-scan.mjs` — built-in secret patterns, with optional deeper scanning if
  [`gitleaks`](https://github.com/gitleaks/gitleaks) is installed (scans tracked files only).
- `.github/hooks/deny-dangerous.js` — a PreToolUse speed-bump against destructive commands (fail-open;
  not an authority boundary).
- `node .github/hooks/eos-doctor.mjs` — SDLC gate + secret-hygiene advisories.
- Keep secrets in env/secret stores only; commit a placeholder `.env.example` and gitignore real `.env`.

When published publicly on GitHub, also enable the free **secret scanning + push protection** and
**Dependabot** (tracked as one-time hardening in `docs/eos/activation.md`).
