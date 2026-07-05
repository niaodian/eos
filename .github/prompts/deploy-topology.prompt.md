---
name: deploy-topology
description: Decide the deployment topology (bare process / Docker / K8s / serverless / PaaS) against NFRs and record an ADR
agent: agent
tools: ['search', 'editFiles']
---
# Deployment Topology Decision (EOS) — Phase 4 / Gate G4

Walk `docs/checklists/G-deployment.md`. Using the NFR targets already set in
`docs/checklists/C-nfr.md` (SLO/RTO/RPO, peak QPS, growth, scaling strategy), pick the
**simplest topology that meets them** — do **not** default to Kubernetes.

For each row of the G.1 matrix, judge fit against those NFRs; then fill every G.2 item with a
concrete answer or "N/A + reason". Record the choice as an ADR
(`docs/adr/NNN-deployment-topology.md`, same shape as `/adr`: Status / Context / Decision /
Consequences / Alternatives considered) and land a **Deployment** section in
`docs/architecture.md`.

Honest local-first boundary: this decides the target topology + its rollback/canary/health
contract only. Provisioning the real cluster/registry/cloud is `【Needs enterprise env】`; keep local
dev + CI runnable without it.

Output: filled `docs/checklists/G-deployment.md`, `docs/adr/NNN-deployment-topology.md`, and a
Deployment section in `docs/architecture.md`.

> **Next:** the chosen topology's manifests (`Dockerfile` / `compose.yml` / `k8s/*.yaml` /
> `serverless.yml`) inherit the R8 release-ops rules. Return to `eos-architecture` (G4); at
> Phase 8 `/release-gate` (G8) verifies the rollback / canary / health contract matches this decision.
