# smartdesk-core

工单核心服务（Go）。工单权威数据源，覆盖工单全生命周期。**仅供内部调用**：调用方为
gateway，携带服务令牌（serviceAuth），并透传最终用户身份头（`X-User-*`）。

契约：[`openapi/core.yaml`](../../openapi/core.yaml)（冻结，不得擅改）。
数据模型/事件：`specs/SmartDesk系统架构设计说明书.md` §3 / §5。

## 状态（M2.1）

CORE-0 骨架已落地：

- HTTP 服务 + 优雅退出，运维端点 `/healthz`、`/readyz`（含 DB 依赖探测）、`/metrics`
- 配置（环境变量，见 `.env.example`）
- 结构化日志（slog / JSON）
- DB 连接池 + **内嵌 SQL 迁移**（`migrations/`，启动时自动应用，幂等）
- 权威 DB schema（`0001_init.sql`，枚举与字段对齐契约）+ 基线种子（`0002_seed_baseline.sql`：SLA v1、taxonomy）
- 领域事件发布客户端接口 + 日志实现（`internal/events`）

待接入（A/B 模块）：`/v1/tickets` 等领域路由——状态机（CORE-A1）、分派（CORE-A2）、
评论/可见性（CORE-B1）、查询/时间线（CORE-B3）在此骨架之上挂载。

## 运行

```bash
# 无 DB（readiness 报告 database=disabled，降级可启动）
go run ./cmd/server

# 带 DB（启动时自动迁移）
export CORE_DATABASE_URL='postgres://smartdesk:smartdesk@localhost:5432/smartdesk?sslmode=disable'
go run ./cmd/server

go test ./...
```

## 布局

```
cmd/server        入口与启动编排
internal/config   环境变量配置
internal/logging  slog JSON 日志
internal/db       连接池 + 迁移执行器
internal/httpapi  路由 + 运维端点
internal/events   领域事件发布接口
migrations        内嵌 SQL 迁移（权威 schema）
```
