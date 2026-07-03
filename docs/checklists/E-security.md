# E. Security & Secrets Checklist (decision per item: adopt / not applicable + reason / defer + trigger condition)

> Walk at G2 (requirements) and re-verify at G8 (release). Supply-chain + secret hygiene.

## Secrets & config isolation
- [ ] No secret in code / logs / fixtures / frontend bundle (`node .github/hooks/secret-scan.mjs` PASS; deeper: `gitleaks` if installed)
- [ ] `.env` gitignored; `.env.example` committed with placeholders only
- [ ] No secret behind `NEXT_PUBLIC_` / `VITE_` (those ship to the browser)
- [ ] Secrets sourced from env / a secret store; injected at runtime, not baked into images
- [ ] Separate config per environment (dev/staging/prod); prod secrets never reused locally
- [ ] Least-privilege credentials (DB user scoped to needed ops; no shared superuser)
- [ ] Key rotation plan + revocation path (who/when/how)

## Supply chain (dependency poisoning)
- [ ] Lockfile committed; versions pinned (no floating `latest`)
- [ ] `npm ci` (not `npm install`) for reproducible installs; vet new/updated deps
- [ ] Install scripts distrusted for unvetted packages (`--ignore-scripts` when auditing)
- [ ] Dependency audit clean (`npm audit` / `pip-audit`); typosquat/new-maintainer check for critical deps
- [ ] No `curl … | bash` / remote-script-to-shell in setup or CI
- [ ] `【Optional · maturity】` SBOM generated + artifacts/commits signed + provenance (regulated/enterprise delivery)

## AuthZ & data
- [ ] Deny-by-default authz on every state-changing operation
- [ ] Data classified (public/internal/PII); PII encrypted at rest & in transit
- [ ] Audit log for sensitive operations (no PII/secret in the log itself)
