# smartdesk-core

工单核心服务（权威数据源）。实现 `openapi/core.yaml` 内部契约，覆盖 M2.1 MVP 闭环：
**建单 → 受理 → 处理中 →（等用户：SLA 暂停）→ 已解决 → 已关闭**，含状态机、分派、
评论/内部备注可见性、时间线/审计、SLA 计时与权威配置（taxonomy / SLA 策略 / 用户角色）。

## 设计要点

- **契约先行**：HTTP 形态严格对齐 `openapi/core.yaml`，未改契约。
- **轻依赖**：仅 `lib/pq`（Postgres 驱动）；离线可 `go build` / 单元测试（Go 1.23，net/http method+path 路由）。
- **状态机**（`internal/domain`）：显式 `action→from→to` 映射，非法跃迁 **409**，重复目标态幂等（200）。
  `resume` 单一化（仅 `suspended→in_progress`）；`pending_user→in_progress` 两条路径：
  系统自动（报单人回复 `user_reply`）或坐席手工 `start`，不复用 `resume`（梁栋裁决）。
- **SLA**（`internal/domain/sla.go`）：建单按优先级启动计时，`pending_user` 暂停、恢复顺延（§8）。
- **领域级可见性**（§6）：core 信任 gateway 透传的 `X-User-*` 头，对 requester 过滤内部备注；
  requester 不可写内部备注（403）。服务令牌签名/aud 校验为部署期 hook（MVP 不强校验）。
- **事件**（`internal/event`）：统一信封（§5.2，`event_id` uuidv7 去重），发布 `ticket.created/
  status_changed/assigned/commented/resolved/closed/...`；总线 best-effort，故障不阻塞主写路径。
- **持久化**：可插拔 `store.Store` 接口，两套实现——
  - **Postgres**（`internal/store/postgres.go`，生产）：设置 `CORE_DATABASE_URL` 即启用；
    启动时自动应用内嵌迁移（`migrations/*.sql`，幂等）并对空库灌入基线配置（taxonomy/SLA/用户）。
  - **内存**（`internal/store/memory.go`，本地/CI）：不设 DSN 时使用，无需数据库即可跑全链路。
  - HTTP 层不感知底层存储；`migrations/0001_init.sql` 为权威 schema，`0002_ticket_counter.sql` 提供工单号序列。

## 运行

```bash
cd src/smartdesk-core
# 内存模式（无需 DB）
go run ./cmd/smartdesk-core                       # 监听 :8081（CORE_HTTP_ADDR 可配）

# Postgres 模式（启动自动迁移 + 种子）
export CORE_DATABASE_URL='postgres://smartdesk:smartdesk@localhost:5432/smartdesk?sslmode=disable'
go run ./cmd/smartdesk-core
curl -s localhost:8081/healthz && curl -s localhost:8081/readyz
```

## 测试

```bash
cd src/smartdesk-core
go test -count=1 ./...                            # 单元 + httptest E2E（内存，无需 DB）

# Postgres 集成测试（指向可用实例，未设则自动跳过）
export CORE_TEST_DATABASE_URL='postgres://smartdesk:smartdesk@localhost:5432/smartdesk?sslmode=disable'
go test -count=1 ./internal/store/ -run TestPostgresStore
```

- `internal/domain` —— 状态机/取消/幂等/系统动作单元测试。
- `internal/httpapi` —— httptest 真实 HTTP 客户端 E2E：建单→受理（幂等）→非法 close(409)→
  处理→等用户(SLA 暂停)→报单人回复自动恢复→已解决→已关闭，评论可见性过滤，配置种子，幂等键去重。
- `internal/store` —— Postgres 适配器集成测试：建单/SLA/分派/评论可见性/时间线/列表过滤的真实落库往返。

## 接口一览

| 方法 | 路径 | 说明 |
|---|---|---|
| POST/GET | `/tickets` | 建单 / 列表（过滤·分页） |
| GET/PATCH | `/tickets/{id}` | 详情（含 SLA）/ 更新（改价触发 SLA 重算） |
| POST | `/tickets/{id}/transitions` | 状态流转（409 / 幂等） |
| POST | `/tickets/{id}/assignments` | 分派/改派/转派/升级 |
| GET/POST | `/tickets/{id}/comments` | 评论列表（可见性过滤）/ 新增（含内部备注·@提及） |
| GET | `/tickets/{id}/timeline` | 时间线/审计（正序追加） |
| GET | `/tickets/{id}/sla` | SLA 计时 |
| GET/POST | `/config/categories` | taxonomy |
| GET/PUT | `/config/sla-policies` | SLA 策略 |
| GET/POST | `/config/users`，PUT `/config/users/{id}/roles` | 用户/角色目录 |
| GET | `/healthz`，`/readyz` | 健康/就绪 |

> 范围说明：附件预签名（`/attachments`）、关联/合并（`/links`）、CSAT、watchers、
> 分类 PATCH/DELETE 为契约已定义、本次 MVP 未实现的后续项，留给 CORE-B 补齐。
> 服务令牌（serviceAuth）签名/aud 校验为部署期 hook，上生产前须强制启用。
