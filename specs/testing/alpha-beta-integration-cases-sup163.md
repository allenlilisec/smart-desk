# SmartDesk Alpha/Beta 集成测试用例补全与可测性评审（SUP-163）

> **版本**：v1.0　|　日期：2026-06-16　|　编制：林桥（集成测试工程师）
> **事实源**：
> - 集成测试策略框架：[`specs/SmartDesk集成测试策略与用例框架.md`](../SmartDesk集成测试策略与用例框架.md)（SUP-62，已合入 main）
> - 系统详设：[`specs/SmartDesk系统详细设计与实现说明书.md`](../SmartDesk系统详细设计与实现说明书.md) v1.0
> - 接口契约：[`src/openapi/{gateway,core,insight}.yaml`](../../src/openapi/)
> - P3 /tasks：SUP-111 core、SUP-112 gateway、SUP-113 insight、SUP-114 web
> - 需求基线：PRD v1.0 + [`SmartDesk用户故事与验收标准.md`](../SmartDesk用户故事与验收标准.md)
>
> **范围**：本轮只补全用例与可测性评审，不执行实跑；实现交付后由 SUP-72/SUP-73 承接执行。

---

## 1. 可测性缺口清单

> 评审对象：P3 四模块 `/tasks` 中涉及跨服务集成、事件消费、RBAC、状态机、SLA、通知等关键项。
> 以下缺口按「阻塞集成测试设计/执行」程度排序，已在对应 issue 下评论提出。

| # | 对应 Issue | 缺口 | 风险 | 建议补充的验收标准 |
|---|---|---|---|---|
| G-1 | [SUP-113](mention://issue/63d92b24-679e-41c9-b925-b48b4157f62e) O-1 | `insight.classification_suggested` 写回事件 payload 未固化：`insight.yaml#/PredictResult` 是嵌套结构，而 `core.yaml#/ClassificationSuggestion` 是扁平结构 | M3 写回链路（S-03）集成测试无法断言字段映射；core 消费侧 T043/T044 缺精确输入 | ① 在 insight /tasks 或契约附录中给出 `PredictResult → ClassificationSuggestion` 字段映射表；② 明确 `category_id`/`priority`/`confidence`/`applied` 四条字段的取法；③ 若两方不同构，建议以 core 消费侧为准调整 insight 发布 payload |
| G-2 | [SUP-113](mention://issue/63d92b24-679e-41c9-b925-b48b4157f62e) O-3 | 邮件网关 / SMTP 选型未决，M3 投产阻塞 | S-14 邮件通知用例无法确定测试环境替身与生产基线 | ① 明确测试环境使用 MailHog/ConsoleMailer；② 明确生产 SMTP 规格、凭证注入方式、超时/重试策略；③ 在 INS-6 验收中补充「邮件发送失败 → 重试 3 次 → 死信」的端到端断言 |
| G-3 | [SUP-113](mention://issue/63d92b24-679e-41c9-b925-b48b4157f62e) O-6 | 分类树同步方式未定义：insight 分类预测如何感知 core 分类树增删改 | 自动分类/定级建议用例无法构造稳定的分类输入与预期 | ① 明确 insight 是只读调用 core `/config/categories` 还是通过事件同步；② 给出分类树变更到 insight 预测可见的最大延迟；③ 给出禁用/删除分类后的兜底行为 |
| G-4 | [SUP-112](mention://issue/915ea22c-7c63-4fb6-960f-4d5266a29c53) D-1 | `GET /auth/me` 实现仍返回 `org_id`，与 `gateway.yaml` D4 裁决删除冲突 | S-15 认证用例会出现契约漂移；web 可能误消费该字段 | T014 移除 `AuthService.buildMe()` 中的 `org_id`，更新 e2e 断言严格对照 `Me` schema（只含 `user_id/username/display_name/roles[]`） |
| G-5 | [SUP-112](mention://issue/915ea22c-7c63-4fb6-960f-4d5266a29c53) T007 | 34 operations 的 `@RequireAction` 覆盖清单尚未与 RBAC 矩阵逐格对齐 | S-16 越权红线用例无法穷举，易漏测 manager 改工单、requester 调 admin 等场景 | ① T007 产出「operation × role」矩阵并作为测试输入；② 矩阵中标注每个 operation 的允许角色；③ 将矩阵纳入契约测试或 e2e 参数化用例 |
| G-6 | [SUP-112](mention://issue/915ea22c-7c63-4fb6-960f-4d5266a29c53) GW-5 | `service-jwt` 签发、`mTLS` 通道、`X-User-*` 透传头未实现 | S-18 服务间信任边界用例无法执行；绕 gateway 直连 core/insight 的拒绝场景缺依据 | ① T031 明确 service-jwt 的 iss/sub/aud/TTL/轮换策略；② T032 明确 mTLS 在开发环境可否跳过及跳过开关；③ 给出缺失/过期/aud 不符 service-jwt 的预期错误码 |
| G-7 | [SUP-111](mention://issue/42dd1c31-56f2-4ed6-a4b2-ff92f48808a3) Phase 11 | 写回消费（T043/T044）阻塞于 insight `insight.classification_suggested` schema 冻结 | 同 G-1；M3 S-03 用例无法细化 | 在 T043 验收标准中明确：① 按 `event_id` 去重；② `confidence≥0.85` 且自动填充开关开才落库；③ 否则仅保留建议态；④ 写回时间 ≤ NFR P95 2s |
| G-8 | [SUP-113](mention://issue/63d92b24-679e-41c9-b925-b48b4157f62e) / 契约 | `insight.yaml` 仍为 `v1.0.0-draft`，未正式冻结 | M3 智能/通知/统计用例缺乏稳定事实源 | 尽快冻结 `insight.yaml` 并升级 `info.version`；冻结后执行 `api-contract-check` 作为集成测试入口门禁 |
| G-9 | [SUP-113](mention://issue/63d92b24-679e-41c9-b925-b48b4157f62e) / 契约 | `insight.yaml#/DomainEvent` payload 中 `ticket.commented`/`ticket.merged`/`insight.classification_suggested` 标记为"M4 固化前不约束"的自由 object | S-19 事件可靠性用例对这三类事件无法做 schema 断言 | M4 固化前至少给出示例 payload 字段清单，或补充说明 core/insight 消费侧如何进行最小字段校验 |
| G-10 | 契约 | `gateway.yaml` `/tickets/{id}/assignments` POST 201 响应体无 schema | S-06 分派用例无法断言返回体 | 补充响应 schema：至少返回 `assignment_id`/`ticket_id`/`to_user_id`/`kind`/`created_at`，与 core `Assignment` 视图对齐 |

> **说明**：以上缺口不影响 SUP-62 框架定稿；但会阻塞对应场景从"框架"进入"可执行用例"，建议在 P4 实现前闭环。

---

## 2. 用例总览

### 2.1 分级与门禁
沿用 SUP-62 定义：

| 优先级 | Alpha | Beta | 失败处置 |
|---|---|---|---|
| **P0** 主流程 / 架构红线 | ✔ 100% 通过 | ✔ 100% 通过 | 任一失败即驳回 |
| **P1** 异常分支 | 抽取关键项 | ✔ 100% 通过 | 100% 通过方可准出 |
| **P2** 边界 / 性能 / 并发 | 不跑 | ≥95% 通过 | 未达需缺陷评估 |

### 2.2 场景 × 分级矩阵（在 SUP-62 基础上细化）

| 场景 ID | 场景名称 | P0 | P1 | P2 | Alpha | Beta |
|---|---|---|---|---|---|---|
| S-01 | 提单建单 | 建单成功 + 落库 + 事件 | 必填校验 422、分类非法 | 高并发建单、超长字段 | ✔ | ✔ |
| S-02 | AI 不可用降级建单 | 建单仍成功（红线） | 总线断开不阻塞 | 部分降级（仅相似失败） | ✔ | ✔ |
| S-03 | 异步分类/定级/相似写回 | 建议最终可见、不阻塞 | 重复事件幂等 | 阈值 0.85 临界 | ✔ | ✔ |
| S-04 | 工单详情聚合（懒加载） | 主体加载成功 | 相似失败降级 | 超时 8s 边界 | 抽取 | ✔ |
| S-05 | 八态状态机全跃迁 | 主路径 new→closed | 非法跃迁 409、幂等 | 并发流转冲突 | ✔ | ✔ |
| S-06 | 分派/改派/转派/升级 | 分派→通知 | 越权分派 403 | 连续改派事件序 | ✔ | ✔ |
| S-07 | 评论/内部备注/@提及 | public 评论可见 | internal 过滤、@通知 | 并发评论分页 | ✔ | ✔ |
| S-08 | 附件上传/下载 | 主路径 | 越权下载 403、类型 422 | 20MB 临界、限额 413 | ✔ | ✔ |
| S-09 | SLA 计时/暂停/恢复/预警/超时 | 计时启动 + 暂停恢复 | 超时 breached + 升级 | 优先级变更重算、临界预警 | ✔ | ✔ |
| S-10 | 解决→通知→确认关闭/7天重开 | resolve→close 主路径 | 7 天内 reopen | 第 7/8 天边界 | ✔ | ✔ |
| S-11 | CSAT 满意度 | resolved/closed 可评 | 非可评价状态 409 | 重复评分 | 抽取 | ✔ |
| S-12 | 关联/合并工单 | M3 对外主路径 | 关系冲突 409 | 多子单合并 | — | M3 |
| S-13 | 看板统计近实时 | stats 返回有数据 | 维度/区间正确 | 事件投影最终一致 | — | M3 |
| S-14 | 通知（站内+邮件）与策略 | 站内通知生成/已读 | 策略开关即时生效 | 邮件死信、幂等 dedupe | 抽取 | M2/M3 |
| S-15 | 认证全链路 | 登录→访问→登出 | 刷新失效 401 | 并发会话 | ✔ | ✔ |
| S-16 | RBAC 越权红线 | 越权 403（红线） | 内部备注过滤 | 多角色兼任 | ✔ | ✔ |
| S-17 | 限流 | — | 超阈值 429 | 滑窗边界、突发 | 抽取 | ✔ |
| S-18 | 服务间信任边界 | 绕 gateway 直连被拒 | aud 不符拒绝 | service-jwt 过期 | ✔ | ✔ |
| S-19 | 事件可靠性 | — | 至少一次+幂等 | 单工单顺序、消费 lag | 抽取 | ✔ |
| S-20 | 健康检查与就绪依赖 | `/healthz` 200 | `/readyz` 503 语义 | 依赖恢复后自愈 | ✔ | ✔ |
| S-21 | admin 配置生效 | 分类/SLA/用户/策略 CRUD | 非 admin 403 | 配置变更即时生效 | 抽取 | ✔ |

---

## 3. Alpha/Beta 集成测试用例详单

> 每条用例包含：ID、场景、级别、标题、前置条件、测试步骤、预期结果、依赖模块/任务、自动化方式、失败归属。
> 用例激活条件：所涉模块详设已冻结 + 契约段冻结 + 服务可拉起（沿用 SUP-62 §5）。

### S-01 提单建单

#### IT-01-A001 · P0 · 报单人成功建单
- **前置**：WEB-0/1 就绪；GW-1 认证可用；CORE-A1 建单实现；NATS/Postgres 可用。
- **步骤**：
  1. requester 登录获取 JWT；
  2. `POST /api/v1/tickets` 带 title/description/category_id/priority/Idempotency-Key；
  3. 记录返回 ticket id、number、status；
  4. 查询 `GET /api/v1/tickets/{id}`；
  5. 检查 core `/readyz`、NATS stream、timeline。
- **预期**：
  - ① 201，返回 `Ticket` schema 全字段，status=`new`，number 格式 `SD-YYYY-NNNNNN`；
  - ② core `tickets` 表存在记录，requester_id 正确；
  - ③ SLA 计时器已启动（`GET /tickets/{id}/sla` 返回 response_due_at/resolve_due_at）；
  - ④ timeline 存在 `ticket_created` 条目；
  - ⑤ NATS `smartdesk.ticket.created` 已发布，事件 envelope 字段完整。
- **依赖**：SUP-111 T023、SUP-112 T038、SUP-114 T-01-2。
- **自动化**：Playwright/E2E + REST 断言 + NATS 消费探针。
- **失败归属**：core（建单失败）/ gateway（转发失败）/ web（表单错误）。

#### IT-01-A002 · P0 · 建单幂等（Idempotency-Key）
- **步骤**：同一 Idempotency-Key 在 5 秒内重复提交两次相同 payload；第二次改 title。
- **预期**：① 两次均 201；② 第二次返回首次创建的 ticket，title 与首次一致；③ 数据库只新增 1 条 ticket。
- **依赖**：SUP-111 T022/T023、SUP-112 T010。

#### IT-01-A003 · P1 · 缺必填字段 422
- **步骤**：POST /tickets 不带 title。
- **预期**：400 或 422，`Error{code, message, details?, trace_id}`，trace_id 透传。
- **依赖**：SUP-111 T023、SUP-112 T033。

#### IT-01-A004 · P2 · 高并发建单号段不重复
- **步骤**：10 并发同时建单。
- **预期**：① 全部 201；② number 不重复；③ 无 500/409 冲突。
- **依赖**：SUP-111 T023 行锁/FOR UPDATE。

### S-02 AI 不可用降级建单

#### IT-02-A001 · P0 · NATS 不可用时建单仍成功
- **前置**：停掉 NATS JetStream（或阻塞 insight 消费）。
- **步骤**：requester 建单。
- **预期**：① 201，status=`new`；② 工单可正常查询；③ 无超时/500；④ insight 恢复后事件可补消费（如启用 outbox）。
- **依赖**：SUP-111 T013 outbox relay、SUP-113 T007/T008。

#### IT-02-A002 · P1 · insight 503 时相似端点降级
- **前置**：insight `/similarity/search` 返回 503。
- **步骤**：打开工单详情。
- **预期**：① 主体 200；② similar 区域展示为空或"暂不可用"，不阻塞页面；③ 无 500。
- **依赖**：SUP-112 T055/T059、SUP-114 T-02-8。

### S-03 异步分类/定级/相似写回

#### IT-03-A001 · P0 · 建议最终可见且不阻塞主流程
- **前置**：分类树、种子语料就绪；insight 分类模型可用。
- **步骤**：
  1. requester 建单（记录创建时间 T0）；
  2. 立即断言 201（不等待 AI）；
  3. 轮询 `GET /tickets/{id}/suggestion` 最多 5s。
- **预期**：① 建单 < 500ms；② 5s 内 suggestion 非空，含 category_id/priority/confidence/applied；③ 当 confidence≥0.85 且 applied=true 时，工单 category_id/priority 被自动填充。
- **依赖**：SUP-111 T044、SUP-113 T009/T021、G-1 闭环。

#### IT-03-A002 · P1 · 重复事件幂等去重
- **前置**：insight 发布两次相同 `event_id` 的 `insight.classification_suggested`。
- **步骤**：core 消费后检查 suggestion 与时间线。
- **预期**：① suggestion 只更新一次；② 时间线只有一条 `classification_suggested` 记录；③ 无重复副作用。
- **依赖**：SUP-111 T043/T044、SUP-113 T009。

#### IT-03-A003 · P2 · 0.85 阈值临界
- **步骤**：构造 confidence=0.84 与 0.85 两个事件。
- **预期**：① 0.84 时 applied=false，category_id/priority 不落库；② 0.85 且自动填充开时 applied=true 并落库。
- **依赖**：SUP-111 T043、SUP-113 T021。

### S-04 工单详情聚合（懒加载）

#### IT-04-A001 · P0 · 详情主体加载
- **步骤**：requester/agent 分别打开自己/本组工单详情。
- **预期**：① 200，返回 `TicketAggregate`；② `sla`/`suggestion` 存在；③ 相似列表可为空。
- **依赖**：SUP-112 T040/T046、SUP-114 T-01-4/T-02-1。

#### IT-04-A002 · P1 · 相似懒加载失败仅 UI 降级
- **前置**：insight `/similarity/search` 超时/503。
- **步骤**：打开详情后触发相似加载。
- **预期**：① similar 返回 200 空列表或友好错误；② 页面不崩溃；③ 主体数据已加载。
- **依赖**：SUP-112 T055/T059。

### S-05 八态状态机全跃迁

#### IT-05-A001 · P0 · 主路径 new→accepted→in_progress→resolved→closed
- **步骤**：
  1. requester 建单；
  2. agent `POST /transitions {action:accept}`；
  3. agent `POST /transitions {action:start}`；
  4. agent `POST /transitions {action:resolve}`；
  5. requester `POST /transitions {action:close}`。
- **预期**：每步 200，最终 status=`closed`；timeline 含每次跃迁；每次事件正确发布。
- **依赖**：SUP-111 T024、SUP-112 T041。

#### IT-05-A002 · P0 · 非法跃迁 409
- **步骤**：对 `new` 状态工单直接 `POST {action:resolve}`；对 `closed` 工单 `POST {action:close}`。
- **预期**：409，`Error{code:'INVALID_TRANSITION'}`；状态不变；timeline 不新增非法记录。
- **依赖**：SUP-111 T022/T024、SUP-112 T041。

#### IT-05-A003 · P1 · 状态流转幂等
- **步骤**：对同一状态同一 Idempotency-Key 重复提交合法 transition 两次。
- **预期**：两次均 200，返回同一 ticket；timeline/status_history 只一条。
- **依赖**：SUP-111 T022、SUP-112 T010。

#### IT-05-A004 · P1 · pending_user 自动恢复
- **步骤**：
  1. agent 将工单置 `pending_user`；
  2. requester 发表 public 评论；
  3. 检查 SLA 与状态。
- **预期**：① 评论后自动触发 `user_reply`，status 回到 `in_progress`；② SLA paused=false，paused_total_seconds 正确累计。
- **依赖**：SUP-111 T035、SUP-112 T043。

#### IT-05-A005 · P2 · 并发状态流转冲突
- **步骤**：两个 agent 同时对同一工单提交不同合法 transition。
- **预期**：① 一条成功，一条 409；② 最终状态与数据库一致；③ 无 timeline 丢失。
- **依赖**：SUP-111 T024 行锁。

### S-06 分派/改派/转派/升级

#### IT-06-A001 · P0 · lead 手工分派给 agent
- **步骤**：lead `POST /tickets/{id}/assignments {kind:manual,to_user_id:agent_id}`。
- **预期**：① 201；② ticket.assignee_id 更新；③ timeline 有 `assigned`；④ NATS `ticket.assigned` 发布；⑤ agent 收到站内通知。
- **依赖**：SUP-111 T029、SUP-112 T042、SUP-113 T036/T038。

#### IT-06-A002 · P1 · requester 越权分派 403
- **步骤**：requester 调用 `/assignments`。
- **预期**：403，审计记录存在。
- **依赖**：SUP-112 T021/T026、SUP-114 T-QA-2。

#### IT-06-A003 · P2 · 连续改派事件顺序
- **步骤**：对同一工单连续 reassign→escalate。
- **预期**：① 两次均 201；② `ticket.reassigned`/`ticket.assigned` 事件按 occurred_at 有序；③ 最终 assignee 正确。
- **依赖**：SUP-111 T029、SUP-113 T007/T008。

### S-07 评论/内部备注/@提及

#### IT-07-A001 · P0 · public 评论对 requester 可见
- **步骤**：agent 发 public 评论；requester 拉取评论列表。
- **预期**：requester 列表含该评论，visibility=`public`。
- **依赖**：SUP-111 T035、SUP-112 T043。

#### IT-07-A002 · P0 · internal 备注对 requester 过滤
- **步骤**：agent 发 internal 备注；requester 拉取评论列表；agent/lead 拉取评论列表。
- **预期**：① requester 列表不含 internal；② agent/lead 列表含 internal；③ 越权直接 `GET /comments/{internal_id}` 返回 403/404。
- **依赖**：SUP-111 T034/T035、SUP-112 T025、SUP-114 T-02-3。

#### IT-07-A003 · P1 · @提及触发通知
- **步骤**：agent 发评论 mentions=[agent_b_id]。
- **预期**：agent_b 站内通知中心出现提及通知，点击可跳转工单。
- **依赖**：SUP-113 T036、SUP-114 T-01-7。

### S-08 附件上传/下载

#### IT-08-A001 · P0 · 附件上传→引用→下载
- **步骤**：
  1. `POST /attachments` 申请预签名上传 URL；
  2. 用预签名 URL PUT 文件到 MinIO；
  3. 建单时带 attachment_ids；
  4. `GET /attachments/{attId}/download` 获取 302 下载 URL；
  5. 访问下载 URL。
- **预期**：① 201 返回 attachment_id 与预签名 URL；② 下载 302 后成功获取文件；③ 附件元数据与 MinIO 对象一致。
- **依赖**：SUP-111 T037/T038、SUP-112 T044。

#### IT-08-A002 · P1 · 越权下载 403
- **步骤**：requester_a 下载 requester_b 工单的附件。
- **预期**：403，审计记录。
- **依赖**：SUP-111 T036、SUP-112 T021。

#### IT-08-A003 · P1 · 类型不在白名单 422
- **步骤**：上传 `.exe` 文件。
- **预期**：422，`code:'INVALID_FILE_TYPE'`。
- **依赖**：SUP-111 T036、SUP-112 T044。

#### IT-08-A004 · P2 · 20MB 临界
- **步骤**：上传 20MB 与 20MB+1B 文件。
- **预期**：20MB 成功；20MB+1B 返回 413。
- **依赖**：SUP-111 T036、core.yaml `size_bytes maximum=20971520`。

### S-09 SLA 计时/暂停/恢复/预警/超时

#### IT-09-A001 · P0 · 建单后 SLA 计时启动
- **步骤**：P2 优先级工单建单后立刻 GET `/sla`。
- **预期**：① response_due_at = created_at + 60min；② resolve_due_at = created_at + 1bd(8h)；③ paused=false；④ breached=false。
- **依赖**：SUP-111 T016/T031、SUP-112 T045。

#### IT-09-A002 · P0 · pending_user 暂停与恢复
- **步骤**：
  1. agent accept/start；
  2. agent wait_user；
  3. 等待 2 分钟；
  4. requester 回复 public 评论触发 user_reply。
- **预期**：③ 期间 paused=true，paused_total_seconds 增加约 120s；④ 恢复后 due_at 顺延，paused=false。
- **依赖**：SUP-111 T031/T035、SUP-112 T043。

#### IT-09-A003 · P1 · 优先级变更触发 SLA 重算
- **步骤**：将 P3 工单 priority 改为 P1。
- **预期**：`GET /sla` 返回新的 response_due_at/resolve_due_at，按 P1 时限缩短；历史 timer 快照不回改。
- **依赖**：SUP-111 T025/T031、SUP-112 T040。

#### IT-09-A004 · P1 · 超时 breached + 升级通知
- **步骤**：构造已超时的 SLA timer（测试时钟推进或短时限种子策略）。
- **预期**：① `GET /sla` breached=true；② NATS `ticket.sla_breached` 发布；③ lead/manager 收到站内通知。
- **依赖**：SUP-111 T033、SUP-113 T036。

#### IT-09-A005 · P2 · pending_user 超时不自动关闭
- **步骤**：工单在 pending_user 状态超过 7 天。
- **预期**：① 收到 3 天/7 天提醒通知；② status 仍为 pending_user；③ 不自动 close。
- **依赖**：系统详设 OQ-8、SUP-113 T036。

### S-10 解决→通知→确认关闭/7天重开

#### IT-10-A001 · P0 · resolve→通知→close
- **步骤**：agent resolve；requester 收到通知后 close。
- **预期**：① resolve 后 status=`resolved`，requester 收到通知；② close 后 status=`closed`，`ticket.closed` 事件发布。
- **依赖**：SUP-111 T024、SUP-113 T036。

#### IT-10-A002 · P1 · 7 天内 reopen
- **步骤**：closed 后第 6 天 requester `POST {action:reopen}`。
- **预期**：200，status=`in_progress`，reopen_count+1。
- **依赖**：SUP-111 T024、SUP-112 T041。

#### IT-10-A003 · P2 · 第 8 天 reopen 被拒
- **步骤**：closed 后第 8 天 requester reopen。
- **预期**：409，`code:'REOPEN_WINDOW_EXPIRED'`。
- **依赖**：SUP-111 T024、core.yaml OQ-13。

### S-11 CSAT 满意度

#### IT-11-A001 · P0 · resolved 后评 5 星
- **步骤**：resolved 工单 requester `POST /csat {score:5,comment:"good"}`。
- **预期**：201；`GET /csat` 返回 score=5/comment/rated_at；工单 csat_score 回填。
- **依赖**：SUP-111 T027、SUP-112 T046。

#### IT-11-A002 · P1 · 非可评价状态 409
- **步骤**：对 in_progress 工单评分。
- **预期**：409，`code:'NOT_RESOLVABLE'`。
- **依赖**：SUP-111 T027、SUP-112 T046。

### S-12 关联/合并工单（M3）

#### IT-12-A001 · P0 · 合并后子单指向主单
- **步骤**：lead 对 ticket_a `POST /links {linked_ticket_id:ticket_b,relation:merged_into}`。
- **预期**：201；ticket_b.merged_into=ticket_a；status 同步；timeline 有 merged；`ticket.merged` 事件发布。
- **依赖**：SUP-111 T041/T042、SUP-113 T008（事件消费）。

### S-13 看板统计近实时（M3）

#### IT-13-A001 · P0 · stats 返回与明细一致
- **步骤**：创建 5 张不同状态工单；manager 查询 `/stats?metric=volume&group_by=status`。
- **预期**：200，series 各状态计数与数据库明细一致；generated_at 近实时。
- **依赖**：SUP-113 T029/T030/T031、SUP-112 T060。

### S-14 通知（站内+邮件）与策略

#### IT-14-A001 · P0 · 站内通知生成与已读
- **步骤**：agent 分派工单给某 agent；该 agent `GET /notifications`；`POST /notifications/{id}/read`；再次 GET。
- **预期**：① 列表含分派通知，unread_count≥1；② 已读 204；③ 再次列表 unread_count 减 1。
- **依赖**：SUP-113 T036/T037、SUP-112 T061。

#### IT-14-A002 · P1 · 通知策略关闭后不再生成
- **步骤**：admin 关闭 agent 的 `ticket.assigned` inapp 策略；重新分派。
- **预期**：该 agent 站内通知中心不再出现新的分派通知（或通知已生成但策略即时生效后后续事件不再生成）。
- **依赖**：SUP-113 T037/T038、SUP-112 T063。

#### IT-14-A003 · P2 · 邮件发送失败死信（M3）
- **前置**：SMTP 配置为无效地址或 MailHog 模拟失败。
- **步骤**：触发需邮件通知的事件。
- **预期**：① 站内通知仍生成；② 邮件状态经 retrying→failed；③ `notification_dead_letters` 有记录。
- **依赖**：SUP-113 T033/T034/T035、G-2 闭环。

### S-15 认证全链路

#### IT-15-A001 · P0 · 登录→me→访问→登出
- **步骤**：
  1. `POST /auth/login` 有效凭证；
  2. `GET /auth/me`；
  3. `GET /tickets`；
  4. `POST /auth/logout`；
  5. `GET /tickets`。
- **预期**：① 登录 200，响应体无 refresh_token（OQ-W2 HttpOnly Cookie）；② me 返回 roles；③ 受保护接口 200；④ 登出 204 并清 Cookie；⑤ 再次访问 401。
- **依赖**：SUP-112 T013-T020、SUP-114 T-01-1。

#### IT-15-A002 · P1 · 无效登录不泄露账号存在性
- **步骤**：用不存在用户名和错误密码分别登录。
- **预期**：均为 401，message 一致（如"凭证无效"），不区分账号是否存在。
- **依赖**：SUP-112 T015。

#### IT-15-A003 · P2 · 并发 refresh 串行化
- **步骤**：同时发起两个 refresh 请求。
- **预期**：只有一个成功，另一个 401（旧 refresh 失效）。
- **依赖**：SUP-112 T016。

### S-16 RBAC 越权红线

#### IT-16-A001 · P0 · requester 访问他人工单 403
- **步骤**：requester_a 建单；requester_b `GET /tickets/{id_a}`。
- **预期**：403，审计记录。
- **依赖**：SUP-112 T021/T026、SUP-111 T025。

#### IT-16-A002 · P0 · requester 访问管理后台 403
- **步骤**：requester `GET /admin/categories`。
- **预期**：403。
- **依赖**：SUP-112 T021。

#### IT-16-A003 · P0 · manager 改工单 403
- **步骤**：manager `PATCH /tickets/{id}` 或 `POST /transitions`。
- **预期**：403。
- **依赖**：SUP-112 T024、SUP-114 T-02-2。

#### IT-16-A004 · P1 · 内部备注对 requester 不返回
- **步骤**：见 IT-07-A002。
- **依赖**：SUP-111 T034/T035、SUP-112 T025。

### S-17 限流

#### IT-17-A001 · P1 · 登录暴力破解触发 429
- **步骤**：连续失败登录 6 次（阈值 5/60s）。
- **预期**：第 6 次 429，响应含 `Retry-After`；Redis 计数正确。
- **依赖**：SUP-112 T049/T050/T053/T054。

#### IT-17-A002 · P2 · 滑窗边界恢复
- **步骤**：触发 429 后等待 60s 再登录。
- **预期**：窗口重置后可再次尝试（仍失败则 401，不 429）。
- **依赖**：SUP-112 T049。

### S-18 服务间信任边界

#### IT-18-A001 · P0 · 绕 gateway 直连 core 被拒
- **步骤**：直接 `GET http://smartdesk-core.internal/v1/tickets` 不带 service-jwt。
- **预期**：401；或网络层拒绝（mTLS 握手失败）。
- **依赖**：SUP-111 T011、SUP-112 T031/T032、G-6 闭环。

#### IT-18-A002 · P1 · 缺失/错误 X-User-* 头仍 401/403
- **步骤**：gateway 透传但 X-User-Id 为空或 X-User-Roles 非法。
- **预期**：core 拒绝处理，返回 401/403。
- **依赖**：SUP-111 T011。

#### IT-18-A003 · P2 · service-jwt 过期
- **步骤**：使用过期 service-jwt 调用 core。
- **预期**：401。
- **依赖**：SUP-112 T031、G-6 闭环。

### S-19 事件可靠性

#### IT-19-A001 · P1 · 重复投递幂等
- **步骤**：向 NATS 手动重发同一 `event_id` 的 `ticket.created` 3 次。
- **预期**：insight 只处理一次；stats/similarity_index 无重复副作用。
- **依赖**：SUP-113 T007、SUP-111 T013。

#### IT-19-A002 · P2 · 单工单事件顺序
- **步骤**：对同一工单连续发生 created→assigned→status_changed→resolved→closed。
- **预期**：insight 消费侧按 occurred_at 顺序处理；最终投影状态与 core 一致。
- **依赖**：SUP-113 T007/T008、insight.yaml DomainEvent D3 裁决。

### S-20 健康检查与就绪依赖

#### IT-20-A001 · P0 · `/healthz` 与 `/readyz`
- **步骤**：分别调用 G/C/I `/healthz`、`/readyz`。
- **预期**：`/healthz` 200；依赖正常时 `/readyz` 200；gateway/insight 在停掉 DB/NATS 后 `/readyz` 503，core `/readyz` 仍返回 200（不强制探测 DB/NATS）。
- **依赖**：SUP-111 T009、SUP-112 T008、SUP-113 T040。

### S-21 admin 配置生效

#### IT-21-A001 · P0 · 分类/SLA/用户/通知策略 CRUD
- **步骤**：admin 分别增删改 `/admin/categories`、PUT `/admin/sla-policies`、POST `/admin/users`、PUT `/admin/notification-policies`。
- **预期**：① 200/201；② 非 admin 调用 403；③ 新配置对后续建单/SLA/通知即时生效。
- **依赖**：SUP-111 T016-T019、SUP-112 T062/T063、SUP-113 T037。

#### IT-21-A002 · P1 · 被引用分类删除 409
- **步骤**：删除一个已被工单引用的分类。
- **预期**：409，`code:'CATEGORY_IN_USE'`。
- **依赖**：SUP-111 T017。

---

## 4. 失败处理与缺陷分级

沿用 SUP-72 约定与 SUP-62 §6 缺陷回流机制：

| 级别 | 判定标准 | 归属分派 | 是否阻断准出 |
|---|---|---|---|
| **P0 阻塞** | 架构红线失败、主流程不通、契约漂移、越权未拦截、SLA 核心计时错误、事件丢失/重复副作用 | 对应模块 Leader（core/gateway/insight/web） | **是**，一票驳回 |
| **P1 严重** | 异常分支错误码语义不符、非法状态流转未 409、幂等失效、限流未触发、配置变更不生效 | 对应模块 Leader | 是，Beta 需 100% 修复 |
| **P2 一般** | 边界精度偏差、性能未达 NFR、UI 降级文案/体验问题、日志/trace 缺失 | 对应模块 Leader | Beta ≥95%，未达需评估 |
| **P3 提示** | 文案、非阻塞 UI 细节、文档与实现口径不一致 | 资料/前端 | 否，可排期优化 |

**建 Bug 模板**（SUP-72）：
- 标题：`[服务名][P0/P1/P2] 一句话缺陷`
- 正文：复现步骤、期望 vs 实际、证据（命令输出/响应体/trace_id/日志）、影响面、归属模块。
- 父 issue：`SUP-72`；状态 `todo`；assignee 为对应模块 Leader。

---

## 5. 依赖与激活条件

### 5.1 按模块的用例激活门控

| 模块 | 依赖任务 | 可激活用例 | 备注 |
|---|---|---|---|
| gateway | SUP-112 Phase 1–4（T001-T028） | S-15/S-16/S-17/S-18 基础用例 | gateway 详设已冻结，可先行细化 |
| core | SUP-111 Phase 1–4（T001-T027） | S-01/S-05/S-10/S-20 基础用例 | core in_review，合入后激活 |
| core | SUP-111 Phase 5–9（T028-T040） | S-06/S-07/S-08/S-09/S-11/S-21 | 需 A1 完成后 |
| insight | SUP-113 Phase 1–2（T001-T010） | S-19 基础用例 | 需事件消费骨架 |
| insight | SUP-113 Phase 3–6（T011-T038） | S-02/S-03/S-04/S-13/S-14 | M2/M3，G-1/G-2/G-3 闭环后细化 |
| web | SUP-114 WEB-0/1（T-00/T-01） | S-15/S-16 门户视角 | web done，可 mock 先行 |
| web | SUP-114 WEB-2/3/4（T-02/T-03/T-04） | S-05/S-06/S-07/S-09/S-13 | M2/M3 |

### 5.2 集成测试入口门禁（与 SUP-62 一致）
1. 所涉模块详设已冻结；
2. 对应 OpenAPI 契约段冻结且实现通过 `api-contract-check`；
3. 服务可在 docker-compose 集成环境拉起并 `/readyz` 通过；
4. 未满足依赖的用例置 `blocked`，不计入通过率分母。

---

## 6. 交付与后续

- **交付件**：本文档 `specs/testing/alpha-beta-integration-cases-sup163.md`。
- **可测性缺口**：已在 SUP-111/SUP-112/SUP-113 对应 issue 下评论提出（详见 §1）。
- **后续动作**：
  - 对应模块实现交付后，由 SUP-72（Alpha/Beta 全量集成回归）按本文用例执行；
  - G-1/G-2/G-3/G-6 等缺口闭环后，将 S-03/S-14/S-18 等场景从"框架"提升为"可执行用例"；
  - 安全红线 S-16/S-18 与武安 SUP-63 安全测试方案对齐去重。
