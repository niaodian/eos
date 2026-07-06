# G. Deployment Topology Decision — Phase 4 (Architecture), Gate G4
> Decision rule: **pick the simplest topology that meets the NFRs**, not "default to K8s". For each item: adopt / reject + reason / defer + trigger condition.
> Local-first boundary: this checklist only **decides the target topology plus its rollback/canary/health contract** and lands an ADR; the real cluster / image registry / cloud
> backend are `【Needs enterprise env】`, and local dev/CI always runs without depending on them.

## G.1 Selection matrix (choose by NFR trigger, simplest to most complex, top to bottom)
| Topology | When justified (NFR trigger) | Rollback semantics | Canary / progressive | Ops cost / team size | Local mapping (manifest) |
|---|---|---|---|---|---|
| **Bare process / single VM** (systemd, PM2) | one instance is enough; no horizontal-scale need; low QPS, no hard HA target | swap binary + symlink rollback + restart | blue-green two-port manual switch | lowest; 1–3-person MVP | none (process-manager script) |
| **Docker single container / compose** | need reproducible env, dependency isolation; multiple services on one host; still no autoscaling | roll back image tag + restart container | compose dual-stack + reverse-proxy switch | low; small team | `Dockerfile` / `compose.yml` |
| **Kubernetes** | hard HA (multi-replica/self-healing), load-based autoscaling, multi-service orchestration, rolling-release SLA | `kubectl rollout undo` | Deployment rolling + canary (traffic split / Argo Rollouts) | high; adopt only with platform/SRE capability | `k8s/*.yaml` (Deployment/Service/HPA/Ingress) |
| **Serverless / FaaS / edge** | event-driven, bursty traffic, scale-to-zero cost saving; cold start acceptable | switch function version alias (alias back to old) | version-weighted traffic split (10%→100%) | medium; no ops base but vendor lock-in | `serverless.yml` / function config |
| **Managed PaaS** (Render / Fly / Railway…) | want near-K8s elasticity without SRE; trade control for convenience | one-click platform rollback to the previous release | platform built-in canary / preview | medium-low; 1–5-person product-heavy, ops-light | platform `*.yml` (+ most accept a `Dockerfile`) |

## G.2 Decision items (fill in each)
- [ ] **Chosen topology + NFR basis**: ____ (cite the SLO/RTO/RPO, peak QPS, growth, and scaling strategy in `C-nfr.md` — not a gut call or bandwagon)
- [ ] **Rejected options + reasons**: ____ (especially "why not K8s" or "why not bare process")
- [ ] **Rollback mechanism** (executable for the chosen topology): ____ → write into `ops/runbook-*.md`
- [ ] **Canary / progressive-release mechanism** (for the chosen topology): ____ + rollback threshold ____
- [ ] **health/readiness endpoints** — how the topology consumes them (probe / reverse proxy / LB health check): ____
- [ ] **Config & secret injection** (12-factor: env / secret store, never in the image or repo; see `E-security.md`): ____
- [ ] **Reproducible build**: base-image digest pinned / lockfile committed / versions pinned: ____
- [ ] **Scaling model**: vertical / horizontal; is scale-to-zero cold start acceptable?: ____ (align with capacity & scaling in `C-nfr.md`)
- [ ] **Statefulness**: is the app stateless? where does state live (DB / object store / cache)? is migration reversible?: ____
- [ ] **Cost × team-size sanity check**: does topology complexity match the team's ops capability (don't put a 2-person MVP on K8s)?: ____
- [ ] **Local-first boundary**: mark the chosen topology's real base (cluster/registry/cloud) `【Needs enterprise env】`; local dev/CI still runs without it: ____
- [ ] **ADR written**: `docs/adr/NNN-deployment-topology.md` (choice + alternatives + trade-offs + reversibility)

> Output lands in: `docs/architecture.md` (Deployment section) + `docs/adr/NNN-deployment-topology.md`;
> the topology's manifest (`Dockerfile` / `compose.yml` / `k8s/*.yaml` / `serverless.yml`) automatically picks up the R8
> `release-ops` rule (`applyTo: **/{Dockerfile,*.yml,*.yaml}`). At Phase 8, `/release-gate` (G8) verifies that
> rollback/canary/health match the topology chosen here.
