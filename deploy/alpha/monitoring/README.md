# Alpha/Beta 监控与告警基线

对齐 [`specs/发布监控告警基线.md`](../../specs/发布监控告警基线.md)，为隔离测试栈提供**健康探针 + 黄金信号占位 + 异常即暂停联系人链**。

> **环境说明**：Alpha/Beta 为安全测试隔离环境，**跳过重灰度（直接全量部署）**，但仍保留健康探针、观测与一键回滚能力（见 [`specs/灰度发布策略.md`](../../specs/灰度发布策略.md) 及父任务 SUP-203 发布计划）。

## 1. 四服务健康探针

| 服务 | Liveness | Readiness | 采集方式 |
|---|---|---|---|
| **gateway** | `GET /healthz` | `GET /readyz` | 宿主机 `${GATEWAY_PORT}` 或容器内 `127.0.0.1:3000` |
| **core** | `GET /healthz` | `GET /readyz` | **仅容器网络** `core:8081`（无宿主机端口） |
| **insight** | `GET /healthz` | `GET /readyz` | **仅容器网络** `insight:8000` |
| **web** | `GET /healthz` | —（经 gateway 间接验证） | 宿主机 `${WEB_PORT}` |

### 一键探活

```bash
# Linux/macOS/Git Bash
./scripts/health-probe.sh

# Windows PowerShell
./scripts/health-probe.ps1
```

通过标准：四服务 liveness 200；gateway/core/insight readiness 200。

## 2. 基础设施探针（并行，不替代服务 `/readyz`）

| 组件 | 探针 | compose healthcheck |
|---|---|---|
| PostgreSQL | `pg_isready` | `postgres` service |
| Redis | `PING` | `redis` service |
| NATS JetStream | `http://127.0.0.1:8222/healthz` | `nats` service |
| MinIO | `/minio/health/live` | `minio` service |

## 3. 黄金信号占位（Prometheus）

Alpha/Beta 栈默认**不强制**拉起 Prometheus；探活脚本覆盖 §2 健康门禁。指标采集通过可选 monitoring profile 启用：

```bash
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml --profile monitoring up -d
```

| 黄金信号 | 指标（占位） | 数据源 | Alpha/Beta 状态 |
|---|---|---|---|
| QPS | `sum(rate(http_requests_total[5m]))` | gateway/core/insight `/metrics` | **占位** — monitoring profile 就绪后采集 |
| 错误率 | 5xx / 总量 | `http_requests_total{status_code=~"5.."} ` | **占位** |
| P50/P95/P99 | `http_request_duration_seconds` | Histogram | **占位** |
| 业务 SLI-01 | 建单成功率 | `core_tickets_created_total` | **占位** |
| 业务 SLI-02 | 鉴权失败率 | `gateway_auth_failures_total` | **占位** |
| 业务 SLI-03 | 事件消费滞后 | `*_consumer_lag_seconds` | **占位** |

配置文件：`prometheus.yml`（scrape 四服务 `/metrics` + blackbox 对外探针）、`golden-signals-placeholder.yml`（Recording Rules 占位注释）。

完整阈值与 P0/P1 分级见 [`specs/发布监控告警基线.md`](../../specs/发布监控告警基线.md) §5。

## 4. 异常即暂停 — 联系人链

Alpha/Beta **不适用金丝雀分批放量**，但部署/变更期间仍执行**异常即暂停**：

| 触发 | 阈值（对齐回滚预案 §2） | 一级响应 | 升级 |
|---|---|---|---|
| H-* 暂停 | readyz 失败 / 5xx 升高等 | **万全** 冻结变更、采集快照 | **白帆** 研判（≤10 min） |
| R-* / P0 | 强制回滚条件 | **万全** 执行回滚 Runbook | **白帆** + **CTO**（`multica-test@hotmail.com`） |
| 安全事件 | 越权可复现等 | **武安** 确认 | **白帆** 裁决回滚 |

详见 [`alert-contacts.md`](alert-contacts.md)。

## 5. 与回滚联动

- LKG 版本清单：`../lkg/lkg-template.yaml`（模板）、`../lkg/lkg-alpha-mvp.yaml`（当前快照）
- 回滚 dry-run：`../scripts/rollback-dry-run.sh` / `.ps1`
- 演练记录：`../records/`
