# G. Deployment Topology Decision（部署拓扑决策）— 阶段 4 架构期，门 G4
> 决策规则：**选满足 NFR 的最简拓扑**，不是默认上 K8s。每项：采纳 / 不采纳+理由 / 延后+触发条件。
> 纯本地边界：本清单只**决策目标拓扑 + 其回滚/灰度/health 契约**并落 ADR；真实 cluster/镜像仓库/云
> 后端属 `【需企业/网络环境】`，本地 dev/CI 始终不依赖它也能跑。

## G.1 选型矩阵（按 NFR 触发条件选，从上到下由简到繁）
| 拓扑 | 何时 justified（NFR 触发） | 回滚语义 | 灰度/渐进 | 运维成本 / 团队规模 | 本地映射（manifest） |
|---|---|---|---|---|---|
| **裸进程 / 单 VM**（systemd、PM2） | 单实例够用；无横向扩展需求；QPS 低、无 HA 硬指标 | 换二进制 + symlink 回滚 + 重启 | 蓝绿双端口手切 | 最低；1–3 人 MVP | 无（进程管理脚本） |
| **Docker 单容器 / compose** | 需可复现环境、依赖隔离；单主机多服务；仍无自动扩缩 | 回滚 image tag + 重启容器 | compose 双栈 + 反代切流 | 低；小团队 | `Dockerfile` / `compose.yml` |
| **Kubernetes** | 硬 HA（多副本/自愈）、按负载自动扩缩、多服务编排、滚动发布 SLA | `kubectl rollout undo` | Deployment 滚动 + canary（分流 / Argo Rollouts） | 高；有平台/SRE 能力才上 | `k8s/*.yaml`（Deployment/Service/HPA/Ingress） |
| **Serverless / FaaS / edge** | 事件驱动、突发流量、scale-to-zero 省成本；可接受冷启动 | 切函数版本别名（alias 指回旧版） | 版本权重分流（10%→100%） | 中；免运维基座但供应商锁定 | `serverless.yml` / 函数配置 |
| **PaaS 托管**（Render / Fly / Railway…） | 想要接近 K8s 的弹性但无 SRE；愿以控制权换省心 | 平台一键回滚到上个 release | 平台内建 canary / preview | 中低；1–5 人重产品轻运维 | 平台 `*.yml`（+ 多数吃 `Dockerfile`） |

## G.2 决策项（逐条填）
- [ ] **选定拓扑 + NFR 依据**：____（引用 `C-nfr.md` 的 SLO/RTO/RPO、峰值 QPS、增长、扩展策略——不是拍脑袋/跟风）
- [ ] **被否选项 + 理由**：____（尤其说明"为什么不用 K8s"或"为什么不裸跑"）
- [ ] **回滚机制**（对所选拓扑可执行）：____ → 写进 `ops/runbook-*.md`
- [ ] **灰度/渐进发布机制**（对所选拓扑）：____ + 回退阈值 ____
- [ ] **health/readiness 端点**如何被该拓扑消费（探针 / 反代 / LB 健康检查）：____
- [ ] **配置 & 密钥注入**（12-factor：env / secret store，绝不进镜像或仓库；见 `E-security.md`）：____
- [ ] **构建可复现**：base image 摘要 pin / lockfile 提交 / 版本钉死：____
- [ ] **扩缩模型**：纵向 / 横向；scale-to-zero 冷启动可接受？：____（对齐 `C-nfr.md` 容量&扩展）
- [ ] **有状态性**：应用是否无状态？状态落在哪（DB / 对象存储 / 缓存）？迁移可逆？：____
- [ ] **成本 × 团队规模自检**：拓扑复杂度是否匹配团队运维能力（别给 2 人 MVP 上 K8s）：____
- [ ] **本地优先边界**：所选拓扑的真实基座（cluster/registry/cloud）标 `【需企业/网络环境】`；本地 dev/CI 不依赖它仍可跑：____
- [ ] **ADR 已写**：`docs/adr/NNN-deployment-topology.md`（选型 + 备选 + trade-off + 可逆性）

> 输出落点：决策进 `docs/architecture.md`（Deployment 段）+ `docs/adr/NNN-deployment-topology.md`；
> 拓扑对应的 manifest（`Dockerfile` / `compose.yml` / `k8s/*.yaml` / `serverless.yml`）自动吃 R8
> `release-ops` 规则（`applyTo: **/{Dockerfile,*.yml,*.yaml}`）。阶段 8 `/release-gate`（G8）会校验
> 回滚/灰度/health 与此处所选拓扑一致。
