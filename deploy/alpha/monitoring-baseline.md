# Alpha/Beta 监控基线（实例化）

> 对齐 [`specs/发布监控告警基线.md`](../../specs/发布监控告警基线.md) §2；本环境为安全测试全量部署，跳过重灰度（见 [`specs/灰度发布策略.md`](../../specs/灰度发布策略.md) §3）。

## 1. 探针端点

| 服务 | Liveness | Readiness | 采集方式 |
|---|---|---|---|
| gateway | `GET http://localhost:${GATEWAY_PORT}/healthz` | `GET /readyz` | 宿主机 + compose healthcheck |
| web | `GET http://localhost:${WEB_PORT}/healthz` | 同 healthz | 宿主机 + compose healthcheck |
| core | — | `http://core:8081/readyz`（内网） | compose healthcheck；**无宿主机端口** |
| insight | — | `http://insight:8000/readyz`（内网） | compose healthcheck |
| postgres | `pg_isready` | 同左 | compose healthcheck |
| redis | `redis-cli ping` | 同左 | compose healthcheck |
| nats | `http://127.0.0.1:8222/healthz` | stream 存在性 | compose healthcheck |
| minio | `/minio/health/live` | 同左 | compose healthcheck |

**一键巡检**：`./scripts/health-check.ps1`

## 2. 黄金信号占位（Alpha MVP）

| 信号 | Alpha 实现 | 生产演进 |
|---|---|---|
| 延迟 | gateway `/readyz` 响应时延（脚本计时） | Prometheus `http_request_duration_seconds` |
| 流量 | compose `docker stats` 快照 | `http_requests_total` rate |
| 错误 | health-check 失败计数 | 5xx rate |
| 饱和度 | 容器 CPU/Mem | K8s / node exporter |

## 3. 异常即暂停 — 联系人链

| 级别 | 负责人 | 职责 | 升级 |
|---|---|---|---|
| L1 观测/执行 | **万全** | 健康探针、回滚执行、数据采集 | 5 min 无恢复 → L2 |
| L2 发布裁决 | **白帆** | Go/No-Go、暂停放量/触发回滚 | 数据/安全 → L3 |
| L3 技术裁决 | **石磊**（core）/ **苏睿**（insight）/ **武安**（安全） | DB 迁移、安全事件 | → CTO |
| L4 人类 | **Allen Li（CEO/CTO）** | 重大回滚、数据丢失风险 | — |

本 Alpha/Beta 环境：**安全测试全量部署**，不适用金丝雀分批；异常时直接执行 [`scripts/rollback-dry-run.ps1`](scripts/rollback-dry-run.ps1) 同等流程。

## 4. 告警阈值（Alpha 简化）

| 编号 | 条件 | 动作 |
|---|---|---|
| H-3 | 任一服务 `/readyz` 非 200，连续 2 次 | 暂停验证，万全采集日志 |
| R-1 | 核心登录 `POST /auth/login` 成功率 < 95% | 白帆裁决回滚 |
| R-2 | core 内网建单非 201 | 升级石磊排查 core/gateway 契约 |

完整阈值见 [`specs/发布监控告警基线.md`](../../specs/发布监控告警基线.md) §4 与 [`specs/回滚预案.md`](../../specs/回滚预案.md) §2。
