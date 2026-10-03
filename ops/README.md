# ops/

What it takes to run the product: the runbook, and whatever deployment configuration your topology
needs.

- **`ops/runbook.md` is required to release.** The release gate (G8) reads it — `docs/runbook.md`
  also counts — and fails until it documents rollback (exact, executable steps), a gradual rollout
  (canary, percentage or blue-green) and the health/readiness checks. Write it with the
  `eos-runbook` skill (`/eos-runbook`): one runbook, one section per service.
- **Deployment configuration follows the topology you chose.** The decision is an ADR in `docs/adr/`
  (the `eos-deploy-topology` skill), which G8 also checks; the manifests it implies (container,
  Kubernetes, serverless or PaaS files) can live here. The release rule in
  `.github/instructions/release-ops/` applies to every Dockerfile and YAML file.

`eos upgrade` never touches this folder. Delete this file whenever you like.
