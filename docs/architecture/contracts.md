# SmartDesk 架构总纲 · 跨服务契约冻结（事件 payload + 服务间鉴权）

> 状态：**已冻结**（2026-06-20，梁栋拍板 / SUP-398）
> 编制：梁栋（首席架构 / 架构设计团队 Leader）
> 触发：S4 失败根因分析——两条跨服务契约在设计阶段未冻结，实现双方各写各的，demo 暴露为系统缺陷。
> 原则：**契约先行**。本文为这两条契约的单一裁决入口；修代码只解一次，补契约才能防复发。

---

## 0. 本文定位与"单一事实源"边界

本文是**架构总纲层的契约裁决与责任划定**，不复制已有事实源，避免双份漂移（宪法原则 I/II）。

| 契约 | 机器可校验事实源 | 本文的角色 |
|------|------------------|-----------|
| 事件 payload schema（契约一） | **`src/openapi/insight.yaml` 的 `DomainEvent` + `*Payload` schemas**（`api-contract-check` 据此判定） | 锁定 producer/consumer 责任边界与演进规则，**不重抄字段表** |
| 服务间鉴权（契约二） | 分散于 `deploy/README.md` + `deploy/scripts/generate-alpha-secrets.py` + 架构说明书 §6，**此前无统一裁决文档** | **本文即契约二的权威定义**（签发/校验/注入/轮换/运维规程） |

冲突裁决顺序：本文（责任与规程）→ `insight.yaml`（事件字段）→ 各子系统详设。字段定义如与本文叙述冲突，以 `insight.yaml` 为准并回贴架构裁决。

---

## 契约一：事件 payload schema（producer / consumer contract）

### 1.1 事实源与权威性

- **唯一事实源**：`src/openapi/insight.yaml` → `components/schemas/DomainEvent`（统一信封）与各 `*Payload`。
- **选型权威**：payload 类型由**信封 `event_type` 决定**（不依赖 JSON-Schema `oneOf` 运行时判别——`event_type` 在信封上、不在 payload 内，标准 discriminator 无法以它为键，见 SUP-17 裁决⑤）。`api-contract-check` 按 `insight.yaml` 中的映射表判定。
- **总线**：NATS JetStream，Stream `SMARTDESK_EVENTS`，主题 `smartdesk.<domain>.<event>`；`ticket_id` 一致性哈希分区 → 单工单按 `occurred_at` 有序，跨工单不保证全局序；消费侧仍须按 `event_id` 幂等去重（顺序不替代幂等，D3 裁定）。

### 1.2 事件类型 → payload 映射（权威表在 insight.yaml，此处为索引）

| event_type | producer | consumer | payload schema |
|------------|----------|----------|----------------|
| `ticket.created` | core | insight | `TicketCreatedPayload` |
| `ticket.assigned` / `ticket.reassigned` | core | insight | `TicketAssignedPayload` |
| `ticket.status_changed` | core | insight | `TicketStatusChangedPayload` |
| `ticket.resolved` / `ticket.closed` / `ticket.reopened` | core | insight | `TicketResolvedPayload` |
| `ticket.sla_warning` / `ticket.sla_breached` | core | insight | `TicketSlaPayload` |
| `ticket.commented` / `ticket.merged` | core | insight | （M4 固化前为自由 object） |
| `insight.classification_suggested` | insight | core | `ClassificationSuggestedPayload` |

> 任务背景只点名了 created/status_changed/resolved/closed 四类；本表为**完整事件面**，四类是其子集，均已在 `insight.yaml` 冻结。

### 1.3 责任边界（本次冻结新增的硬约束）

**producer（core 为工单域事件唯一 producer；insight 为 `classification_suggested` 唯一 producer）**

1. 发布的 payload **字段名必须与 `insight.yaml` 对应 `*Payload` 逐字一致**。S4 根因正是字段名漂移导致 `payload_validation_failed`，通知无法入库——此为契约违规，不是实现自由。
2. **字段名 = DB 权威列名**（`§3.1`，SUP-17 裁决①–⑤）。如 `TicketCreatedPayload.requester_id` 对应 `tickets.requester_id`。
3. **事件自包含、反范式化义务在 producer**：`TicketStatusChangedPayload.requester_id` / `TicketResolvedPayload.requester_id` 等在源表（如 `ticket_status_history`）无对应列时，core **必须从 `tickets.requester_id` 反范式化带入 payload**。消费方**不得**为发通知回查 core（否则重新引入 §5.1 已否决的同步耦合）。
4. 便利字段（如 `TicketSlaPayload.level`）须与信封 `event_type` 一致（`sla_warning→warning`、`sla_breached→breached`）；不一致视为契约违规。

**consumer（insight 消费工单域事件；core 消费 `classification_suggested`）**

1. **不得依赖未在契约中定义的字段**。即便 producer 多发了字段，consumer 也不得读取未冻结字段构建业务逻辑。
2. 必须按 `event_id` 幂等去重（落 `processed_events` 表/KV）；写回/通知操作幂等。
3. `classification_suggested` → core 幂等写 `Ticket.suggestion`（D1=纯事件，不新增 core 同步写回端点）。

### 1.4 演进规则（version 语义）

- 当前 `version=1`。同一 version 内 payload **仅可增量新增可选字段**（向后兼容）。
- **删除 / 改名 / 改必填 = 破坏性变更**，必须 bump `version` 并经架构裁决（梁栋）。S4 类字段漂移若以"改名"出现，按破坏性变更治理，**禁止单方静默修改**。
- 校验闸门：`api-contract-check`（秦诺维护）在 CI 中对 producer 产出与 `insight.yaml` 比对；契约变更须同步刷新 `insight.yaml` 并过该闸门方可合入。

---

## 契约二：服务间身份与令牌契约（service-to-service identity contract）

> **本节为契约二的权威定义。** S4 根因：`CORE_SERVICE_TOKEN` 的签发/校验/注入/轮换此前无统一约定，密钥漂移后 `insight→core` 401。以下逐项冻结。

### 2.1 三条服务间调用路径（区分清楚是治理前提）

平台**并存两套服务身份机制**，混淆是缺陷温床，特此分列：

| # | 调用路径 | 令牌 | 签发时机 | aud | 生命期 |
|---|----------|------|----------|-----|--------|
| A | browser → gateway | 用户 JWT（`bearerAuth`，`JWT_SECRET` 对称签） | 登录时 | `smartdesk` | 短时 + refresh 轮换 |
| B | gateway → core / insight | **per-request `service-jwt`**（RS256，gateway 运行时用 `SERVICE_JWT_PRIVATE_KEY` 签） | 每次下游调用 | `core` 或 `insight` | 短时（请求级） |
| C | **insight → core**（`/internal/users/{userId}` 租户解析） | **静态 `CORE_SERVICE_TOKEN`**（RS256，与 B 同一私钥预签发） | 部署期由 `generate-alpha-secrets.py` 预签 | `core` | **365 天**（重跑脚本轮换） |

A 是用户鉴权（gateway 收口），B/C 是服务身份。**S4 故障落在路径 C。**

### 2.2 签发方 / 校验方（谁生成、谁验签）

| 令牌 | 签发方 | 私钥/密钥 | 校验方 | 校验方验签材料 |
|------|--------|-----------|--------|----------------|
| `service-jwt`（路径 B） | gateway 运行时 `ServiceJwtService` | `SERVICE_JWT_PRIVATE_KEY`（RS256 私钥） | core / insight | core 用 `CORE_SERVICE_JWT_PUBLIC_KEY`；insight 用 `SERVICE_JWT_PUBLIC_KEY` |
| `CORE_SERVICE_TOKEN`（路径 C） | `deploy/scripts/generate-alpha-secrets.py`（部署期，用**与 gateway 相同的私钥**） | 同 `SERVICE_JWT_PRIVATE_KEY` | core | `CORE_SERVICE_JWT_PUBLIC_KEY`（**= gateway 公钥，必须同源**） |

**关键不变式**：路径 C 的私钥与路径 B 同源——`generate-alpha-secrets.py` 在**同一次运行**内生成密钥对、用私钥签 `CORE_SERVICE_TOKEN`、把公钥写入 `CORE_SERVICE_JWT_PUBLIC_KEY`。**三者必须来自同一次脚本运行**，否则公私钥不匹配 → core 验签失败 → 401。S4 的"密钥漂移"即违反此不变式。

### 2.3 `CORE_SERVICE_TOKEN` claims（冻结）

```jsonc
{
  "sub": "00000000-0000-4000-8000-000000000001", // Alpha insight 服务身份（固定）
  "roles": ["admin"],
  "org_id": "default",
  "iss": "smartdesk-gateway",                     // SERVICE_JWT_ISSUER
  "aud": "core",                                  // CORE_SERVICE_JWT_AUDIENCE
  "iat": <签发时刻>,
  "nbf": <签发时刻>,
  "exp": <iat + 365d>
}
```
- core 入站中间件：`serviceAuth` 校验 **签名（RS256）+ `aud=core`**，从已验签 claims 读取 `sub/roles/org_id` 注入 context，仅做领域级数据可见性过滤，**不二次鉴权用户身份**（鉴权已在 gateway 收口）。
- 旧 `X-User-* / X-Org-Id` 明文透传头**已废弃**，身份一律走已验签 claims。
- 跨租户校验：insight 调 `GET /internal/users/{userId}` 解析 `user_id → org_id`，与自身 service-jwt claim 的 `org_id` 比对，不一致 / 用户不存在 **fail-closed 拒绝发送**。

### 2.4 注入路径（compose env → 容器环境变量）

```
generate-alpha-secrets.py  ──写──▶  deploy/alpha/.env  (gitignore，本机)
        │
        ├─ SERVICE_JWT_PRIVATE_KEY ─────▶ gateway 容器 env （签 service-jwt）
        ├─ SERVICE_JWT_PUBLIC_KEY ──────▶ insight 容器 env （验 gateway→insight）
        ├─ CORE_SERVICE_JWT_PUBLIC_KEY ─▶ core 容器 env    （验 aud=core）
        └─ CORE_SERVICE_TOKEN ──────────▶ insight 容器 env （insight→core 出站持有）
```
- compose 引用形如 `CORE_SERVICE_TOKEN: "${CORE_SERVICE_TOKEN:-}"`（见 `docker-compose.alpha.yml` / `docker-compose.canary.yml`）：**值从宿主 `.env` 注入，缺省为空串**。`.env` 未生成或未刷新时，容器拿到空 token → 401。
- 变量职责对照见 `deploy/README.md`「Alpha 服务密钥」表。

### 2.5 公私钥对 scope 与轮换约定（冻结）

- **scope**：一套 RS256 密钥对覆盖路径 B + C（gateway 签、core/insight 验）。Alpha/Canary 各环境独立一套，**不跨环境复用**（`.env` 标注 "Alpha-local only — do NOT reuse in production"）。
- **TTL**：`CORE_SERVICE_TOKEN` 365 天；per-request `service-jwt` 请求级短时。
- **轮换 = 重跑脚本**：`python deploy/scripts/generate-alpha-secrets.py --force` 重新生成密钥对并重签静态 token。轮换会**同时换掉公钥与 token**，故必须整体重发，不可只换其一（违反 2.2 不变式即 401）。

### 2.6 运维规程（强制 · S4 直接收口）

轮换密钥后**必须重建全部相关容器**，使新 env 生效：

```bash
# 1) 重新签发（覆盖旧 .env）
python deploy/scripts/generate-alpha-secrets.py --force

# 2) 校验新密钥自洽（公钥能验签 token、aud=core）
python deploy/scripts/verify-alpha-secrets.py

# 3) 重建相关容器，使新 env 注入（缺此步 = 容器仍持旧 token/旧公钥 → 漂移 401）
docker compose -f deploy/docker-compose.alpha.yml up -d --force-recreate \
  gateway core insight
```

- **铁律**：`generate-alpha-secrets.py --force` 之后，**必须** `--force-recreate` 受影响容器（gateway / core / insight）。只换 `.env` 不重建容器 = 进程内仍是旧密钥，正是 S4 现象。
- 重建后以 `verify-alpha-secrets.py` + S-18 系列用例（`S-18-01` 无 token 被拒 / `S-18-02` aud 不符被拒 / `S-18-03` 正常放行）回归确认。

---

## 验收与通知

- 事件 payload 契约：以 `src/openapi/insight.yaml` 为冻结事实源，本文锁定 producer/consumer 责任与演进规则。
- 服务间鉴权契约：以本文 §2 为冻结权威，签发/校验/注入/轮换/运维规程齐备。
- 合入后须通知 core（石磊）、insight（苏睿）、gateway 各域 committer 知悉，并确认以此为单一事实源。
- 本契约为根治措施；B1/B2 代码修复为临时收口。后续字段或令牌变更一律走契约变更治理（梁栋审批 + `api-contract-check` 闸门）。
