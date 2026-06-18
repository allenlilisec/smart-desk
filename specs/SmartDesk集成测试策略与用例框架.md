# SmartDesk 集成测试策略与用例框架（Alpha / Beta）

> 版本：v0.1（框架草案，前置设计）　|　日期：2026-06-14　|　编制：严谨（功能测试负责 / 测试团队 Leader）
> 范围：**集成测试策略主线 + 用例框架**（场景清单 / 接口验证点矩阵 / 优先级分层 / 依赖标注）。**不含**逐条用例细化与执行 —— 随各模块详设冻结与实现交付后由林桥（集成）承接补全。
>
> **事实源**：
> - 系统详设（已冻结 v1.0，2026-06-14）：[`SmartDesk系统详细设计与实现说明书.md`](SmartDesk系统详细设计与实现说明书.md)
> - 接口契约（唯一事实源）：[`src/openapi/{gateway,core,insight}.yaml`](../src/openapi/)（OpenAPI 3.1）
> - 验收基线：组织说明书 §10.3 规范基线 / §11 合入门禁；NFR 见 PRD §7、系统详设 §10。
>
> **关联测试运行 issue**（待实现就绪后提升执行）：SUP-72（Alpha/Beta 全量集成回归）、SUP-73（夜间安全回归，与武安安全测试协同）。

---

## 1. 测试策略主线

### 1.1 目标
对 gateway / core / insight / web 四模块跨服务协作做集成级验收，确保：**契约一致**（实现 ⟷ OpenAPI）、**链路正确**（端到端关键路径行为符合系统详设 §9）、**架构红线必过**（鉴权收口、降级不阻塞、AI 异步写回、幂等可审计），并满足 NFR 性能/可靠性下限。

### 1.2 集成测试在测试金字塔中的定位
- **下界**：各模块单元测试与契约自测（`api-contract-check`）为前置门禁，集成测试不替代单测覆盖率。
- **本层**：以**真实服务进程 + 真实总线（NATS JetStream）+ 真实存储（PG/Redis/MinIO）** 组合验证服务边界与事件流；外部不确定项（邮件 SMTP、对象存储）可用容器化替身（MailHog / MinIO）。
- **上界**：UI 端到端（web→gateway 全链路）取关键主流程冒烟，不做穷举 UI 用例（归 web 模块测试）。

### 1.3 两级集成测试分级
| 级别 | 触发时机 | 范围 | 目标 | 退出门禁 |
|---|---|---|---|---|
| **Alpha（联调冒烟）** | 模块首次联调 / 每次合入后 CI | P0 主流程关键路径 + 接口契约一致性 | 快速发现链路断裂、契约漂移，**< 10 min** 可反馈 | P0 用例 100% 通过；契约校验 0 diff |
| **Beta（全量回归）** | 里程碑（M2/M3/M4）准出、发布前 | P0+P1+P2 全量 + 异常/边界/降级/安全/性能 | 验收裁决依据，覆盖红线与 NFR | P0/P1 100% 通过；P2 ≥95%；红线用例 0 失败；NFR 达标 |

### 1.4 入口 / 出口准则
- **入口（开始集成测试）**：① 所涉模块详设已冻结；② 对应 OpenAPI 契约段冻结且实现通过 `api-contract-check`；③ 服务可在集成环境拉起并 `/readyz` 通过。
- **出口（验收裁决）**：按 1.3 门禁；任一**架构红线用例**失败 → **驳回，不达标不放行**；缺陷按 §6 回流闭环复测后方可关闭。

### 1.5 测试环境基线
- 部署形态：docker-compose 拉起 gateway+core+insight+web + PG + Redis + NATS JetStream + MinIO + MailHog。
- 服务间信任：启用 mTLS + service-jwt + `X-User-*` 透传（系统详设 §7）—— 集成环境必须真实校验，**不得**关闭以"方便测试"。
- 数据：种子数据含分类树 / SLA 策略基线 / 五类角色账号（requester/agent/lead/manager/admin）。
- 可观测：断言依赖 `trace_id` 全链路透传、`/metrics`、`ticket_timeline` 审计追加。

### 1.6 风险与缓解
| 风险 | 缓解 |
|---|---|
| 异步事件验证 flaky（时序不确定） | 以**最终一致断言 + 超时轮询**（如建议写回 ≤ NFR P95 2s 内可见），禁用裸 sleep；消费 lag 走 `/metrics` 辅证 |
| 跨工单事件无全局序（D3） | 仅断言**单工单内** `occurred_at` 有序；跨工单不做顺序断言，只验 `event_id` 幂等去重 |
| 模块详设分批冻结，依赖未齐 | 用例按 §5 依赖标注分批激活，未满足依赖的用例置 `blocked`，不计入通过率分母 |
| 降级路径难构造 | 提供**故障注入**钩子（停 insight / 断 NATS）验证 core 主流程不受影响 |

---

## 2. 跨模块集成链路场景清单

> 按系统详设 §9 主流程 + §6 事件清单 + §2 服务边界推导。链路标注：`G`=gateway `C`=core `I`=insight `W`=web `N`=NATS。

| ID | 场景 | 链路 | 关键断言 | 里程碑 |
|---|---|---|---|---|
| **S-01** | 提单建单（同步落库即成功） | W→G→C→PG，C 发 `ticket.created`→N | 建单单事务落库 status=`new`、返回工单号、启动 SLA 计时、写时间线、`ticket.created` 入流 | M2 |
| **S-02** | AI 不可用降级建单 | 同 S-01 但 I/N 不可用 | **建单仍成功**（红线 US-2.1 AC4 / SC-002）；建议为空；无主流程阻塞 | M2 |
| **S-03** | 异步分类/定级/相似写回 | C `ticket.created`→N→I→`insight.classification_suggested`→N→C 落建议态 | `Ticket.suggestion` 最终可见、`event_id` 幂等去重、P95<2s 不阻塞主流程（§9/SC-004） | M3 |
| **S-04** | 工单详情聚合（懒加载） | W→G 合并 C 工单主体 + 懒加载 `/similar`、`/suggestion` | 主体与相似/建议分离加载；相似失败仅 UI 降级（D2 / US-3.3 AC3） | M2(主体)/M3(相似建议) |
| **S-05** | 八态状态机全跃迁 | W→G→C transitions | 合法跃迁 200、非法跃迁 **409**、幂等（Idempotency-Key）、每次写 timeline+status_history | M2 |
| **S-06** | 分派/改派/转派/升级 | W→G→C assignments，C 发 `ticket.assigned`/`reassigned`→I 通知 | 分派落库、责任人变更、`ticket.assigned` 事件→站内通知 | M2 |
| **S-07** | 评论/内部备注/@提及 | W→G→C comments，C 发 `ticket.commented`→I | 内部备注对 requester 不可见；@提及→通知；对外评论→报单人通知 | M2 |
| **S-08** | 附件上传/下载（鉴权+白名单+限额） | W→G→C attachments + MinIO；下载经 G 鉴权 | ≤20MB、白名单（超限 413 / 类型 422）、下载越权 403（OQ-9 / US-2.7） | M2 |
| **S-09** | SLA 计时/暂停/恢复/预警/超时 | C SLA 引擎 + `pending_user` 暂停；发 `sla_warning`/`sla_breached`→I | 按优先级计时；待用户暂停、恢复顺延；临近预警、超时标记+升级建议（US-2.5） | M2 |
| **S-10** | 解决→通知→确认关闭/7天重开 | C resolve→I 通知报单人→close / reopen(≤7天) | resolved 通知；close 终态；closed 7 天内 reopen（OQ-13）、超期拒绝 | M2 |
| **S-11** | CSAT 满意度（解决后 1–5 星） | W→G `/csat`→C；GET 读 core 工单 csat 字段 | 非可评价状态 409；1–5 星校验；D5 对外补齐一致性 | M2 |
| **S-12** | 关联/合并工单 | W→G→C links，C 发 `ticket.merged`→I 通知 | 合并通知；watchers/links **M3 才对外**（D5），M2 不验对外透出 | M3 |
| **S-13** | 看板统计近实时 | C 事件→N→I 投影读模型→G `/stats` | 事件投影聚合、`group_by`/`interval` 维度、近实时一致性 | M3 |
| **S-14** | 通知（站内+邮件）与策略 | I `/notifications`、`/notifications/policies`、邮件→MailHog | 站内通知（M2）+ 邮件（M3）；按角色/事件订阅策略；至少一次+幂等 | M2(站内)/M3(邮件) |
| **S-15** | 认证全链路（登录/刷新/登出/me） | W→G `/auth/*` + Redis | 有效凭证签发 JWT；无效 401 且不泄露账号是否存在；登出后 401（US-1.1） | M2 |
| **S-16** | RBAC 越权红线 | W→G 各受保护资源 | requester 访他人工单/管理后台→403；内部备注对 requester 不返回；manager 改工单→403；越权记审计 | M2 |
| **S-17** | 限流 | W→G 滑窗超阈值 | 超阈值 429；计数存 Redis（US-1.3 AC2） | M2 |
| **S-18** | 服务间信任边界 | 绕过 G 直连 C/I | 无 service-jwt / aud 不符 → 拒绝；后端不二次鉴权但按 `X-User-*` 领域过滤（§7/§8） | M2 |
| **S-19** | 事件可靠性（至少一次+幂等+顺序） | C 发事件→N→I/C 消费 | 重复投递按 `event_id` 去重；单工单 `occurred_at` 有序；消费 lag 可观测（D3/§6.3） | M2(基础)/M3(全量) |
| **S-20** | 健康检查与就绪依赖 | G/C/I `/healthz`、`/readyz` | liveness 200；gateway/insight readiness 含 DB/总线/读模型依赖、缺失 503；core readiness 不强制探测 DB/NATS | M2 |
| **S-21** | admin 配置生效（分类树/SLA/用户角色/通知策略） | G `/admin/*`→C `/config/*` & I `/notifications/policies` | 配置变更对建单/分派/SLA/通知即时生效；非 admin 403 | M2/M3 |

---

## 3. 接口级集成验证点矩阵

> 每个对外/内部端点的**通用验证维度**（四项必验）：① 请求/响应 **schema** 符合 OpenAPI（字段、必填、类型、enum）；② **状态码**语义（成功码 + 错误码全集）；③ **错误模型** `Error{code,message,details?,trace_id}` 一致；④ **payload 一致性**（gateway 聚合 ⟷ core/insight 源数据、事件信封字段）。下表标注各端点的**重点附加验证点**。

### 3.1 gateway 对外 BFF（`/api/v1`）
| 端点 | 方法 | 重点验证点 | 错误码 |
|---|---|---|---|
| `/auth/login` `/refresh` `/logout` `/me` | POST/GET | JWT 签发/刷新/黑名单；登出后受保护接口 401；错误提示不泄露账号存在性 | 401, 429 |
| `/tickets` | GET/POST | 列表分页 `{items,page,page_size,total}`、过滤；建单转发 core | 401, 403, 429 |
| `/tickets/{id}` | GET/PATCH | 详情**聚合一致性**（G 合并 ⟷ C 工单主体）；manager 改工单 403 | 401, 403, 404 |
| `/tickets/{id}/transitions` | POST | 转发 core；非法跃迁 **409**；`Idempotency-Key` 幂等 | 403, 409 |
| `/tickets/{id}/assignments` | POST | 分派权限；事件触发通知 | 403 |
| `/tickets/{id}/comments` | GET/POST | 内部备注对 requester 过滤；@提及 | 403 |
| `/tickets/{id}/attachments` `/attachments/{attId}/download` | POST/GET | 上传白名单/限额（413/422）；下载越权 **403** | 403, 413, 422 |
| `/tickets/{id}/sla` `/timeline` | GET | SLA 状态/剩余时长（整数分钟）；时间线仅追加、按 trace 透传 | 403, 404 |
| `/tickets/{id}/csat` | GET/POST | 非可评价状态 409；1–5 星；与 core csat 字段一致（D5） | 403, 409 |
| `/tickets/{id}/similar` `/suggestion` | GET/POST | **懒加载**独立端点；相似失败 UI 降级；POST suggestion=人工采纳同步路径（非 AI 写回） | 403, 404 |
| `/stats` `/stats/export` | GET | `group_by∈{time,category,assignee,priority,status}`、`interval`；导出 | 403 |
| `/notifications` `/{notifId}/read` | GET/POST | 站内通知列表/已读幂等 | 403 |
| `/admin/{categories,sla-policies,users,notification-policies}` | * | 仅 admin（非 admin 403）；变更下沉 core/insight 并生效 | 403 |

### 3.2 core 内部（`/v1`，`serviceAuth` + `X-User-*`）
| 端点组 | 重点验证点 |
|---|---|
| `/tickets`(±id) | 建单单事务（落库+SLA+timeline+事件）原子性；查询过滤/分页；越权领域过滤（X-User-*） |
| `/tickets/{id}/transitions` | **状态机映射表**（action→from→to，见 core.yaml）逐跃迁；`user_reply` 系统自动非客户端 action；`resume` 仅 suspended→in_progress；非法 409；每次写 timeline+status_history |
| `/assignments` `/comments` `/attachments` `/links` `/sla` `/timeline` `/watchers` `/csat` | 各自落库 + 对应事件发布；内部备注可见性；附件元数据 ⟷ MinIO 对象一致 |
| `/attachments/{attId}/download-url` | 授权签发下载 URL；越权拒绝 |
| `/config/{categories,sla-policies,users,users/{id}/roles}` | 权威配置变更驱动建单/分派/SLA/RBAC；分类码被 insight 只读引用一致性 |
| `/healthz` `/readyz` | `/healthz` liveness 200；`/readyz` 服务可接收流量，不强制探测 DB/NATS |
| **事件发布** | `ticket.*` 信封 schema（`event_id/event_type/occurred_at/org_id/ticket_id/actor_id/version/payload`）；分区键 `ticket_id`；消费 `insight.classification_suggested` 幂等写回 `Ticket.suggestion` |

### 3.3 insight 内部（`/v1`）
| 端点组 | 重点验证点 |
|---|---|
| `/classification/predict` | 分类/定级**只给建议**（落库权在 core）；阈值≥0.85 可配（OQ-4）；返回 `ClassificationSuggestion` schema |
| `/similarity/search` | 一期关键词+标题/分类；契约前向兼容向量（OQ-5），不绑实现 |
| `/stats/aggregate` `/stats/export` | 事件投影读模型聚合；维度/区间；与 gateway `/stats` payload 一致 |
| `/notifications` `/{notifId}/read` `/notifications/policies` | 站内+邮件发送；按角色/事件订阅策略；至少一次+幂等 |
| `/feedback/classification` | 人工纠偏回流；样本落 `classification_feedback` |
| `/healthz` `/readyz` | readiness 含读模型/总线依赖 |
| **事件消费** | 按 `event_id` 去重（`processed_events`）；单工单 `occurred_at` 有序消费；发 `insight.classification_suggested` 写回 |

### 3.4 事件总线契约验证（横切，对应 S-19）
- **信封一致**：所有事件符合 §6.2 统一 schema；主题 `smartdesk.<domain>.<event>`、Stream `SMARTDESK_EVENTS`。
- **事件清单全覆盖**（§6.3）：`ticket.created/assigned/reassigned/status_changed/commented/sla_warning/sla_breached/resolved/closed/reopened/merged` + `insight.classification_suggested`，每条验"发布者→消费者→用途"链路。
- **可靠性语义**：至少一次投递、消费幂等（`event_id`+`processed_events`）、单工单 `occurred_at` 保序、跨工单不保证全局序（D3）。

---

## 4. Alpha / Beta 用例框架与优先级分层

### 4.1 优先级分层定义
| 优先级 | 含义 | 准入级别 | 失败处置 |
|---|---|---|---|
| **P0 主流程 / 架构红线** | 端到端关键路径 + 4 条架构红线（鉴权收口、降级不阻塞、AI 异步写回、幂等可审计）+ 越权红线 | Alpha + Beta | **任一失败即驳回**，不放行 |
| **P1 异常分支** | 错误码语义、非法跃迁、权限边界、限流、事件幂等、SLA 暂停/超时、降级细化 | Beta（Alpha 抽取关键项） | 100% 通过方可准出 |
| **P2 边界** | 极值（附件 20MB 临界、分页上限、reopen 7 天边界、阈值 0.85 临界）、并发、性能 NFR、罕见组合 | Beta | ≥95% 通过；未达需缺陷评估 |

### 4.2 用例框架矩阵（场景 × 分级 × 级别）
| 场景 | P0 | P1 | P2 | Alpha | Beta |
|---|---|---|---|---|---|
| S-01 建单 | 建单成功落库+事件 | 必填校验 422、分类非法 | 高并发建单、超长字段边界 | ✔ | ✔ |
| S-02 降级建单 | **AI 不可用建单仍成功（红线）** | 总线断开建单不阻塞 | 部分降级（仅相似失败） | ✔ | ✔ |
| S-03 异步写回 | **建议最终可见、不阻塞（红线）** | 重复事件幂等去重 | 阈值 0.85 临界自动填充 | ✔ | ✔ |
| S-05 状态机 | 主路径 new→…→closed | 非法跃迁全集 409、幂等 | 终态再操作、并发流转冲突 | ✔ | ✔ |
| S-06 分派 | 分派→通知 | 越权分派 403 | 连续改派事件序 | ✔ | ✔ |
| S-08 附件 | 上传/下载主路径 | 越权下载 403、类型 422 | 20MB 临界、限额 413 | ✔ | ✔ |
| S-09 SLA | 计时+暂停+预警 | 超时 breached+升级 | 暂停恢复顺延精度、临界预警 | ✔ | ✔ |
| S-10 解决/重开 | resolve→通知→close | 7 天内 reopen | 第 7 天/第 8 天边界、reopen_count | ✔ | ✔ |
| S-15 认证 | 登录→访问→登出 | 刷新失效 401、过期 401 | 并发会话、黑名单时序 | ✔ | ✔ |
| S-16 越权红线 | **越权全场景 403（红线）** | 内部备注过滤 | 多角色兼任边界 | ✔ | ✔ |
| S-17 限流 | — | 超阈值 429 | 滑窗边界、突发 | 抽取 | ✔ |
| S-18 服务信任 | **绕 gateway 直连被拒（红线）** | aud 不符拒绝 | service-jwt 过期 | ✔ | ✔ |
| S-19 事件可靠性 | — | 至少一次+幂等 | 单工单顺序、消费 lag | 抽取 | ✔ |
| S-04/07/11/12/13/14/20/21 | 各自主路径 | 各自异常分支 | 各自边界 | 视依赖 | ✔ |

> Alpha 取每场景 P0 + 关键 P1（标 ✔/抽取）做冒烟；Beta 全量 P0+P1+P2。

---

## 5. 用例前置依赖标注

> 每条用例激活前必须满足：**(详设冻结) AND (契约段冻结+实现) AND (服务可拉起)**。下表给出场景级依赖；逐条用例细化时继承并细化到接口/字段粒度。

| 场景 | 依赖模块详设冻结 | 依赖接口/能力实现 | 当前可设计? | 可执行里程碑 |
|---|---|---|---|---|
| S-01/05/09/10/11 | core（gateway 已冻结） | core 工单/状态机/SLA/csat + GW 转发 | 框架可设计 | M2 |
| S-02/03 | core + insight | core 事件发布+写回消费 / insight 消费 / NATS | 框架可设计 | M2(降级)/M3(写回) |
| S-04 | core + insight + web | GW 聚合 + `/similar` `/suggestion` 懒加载 | 框架可设计 | M2(主体)/M3(相似建议) |
| S-06/07/08 | core | core assignments/comments/attachments + MinIO | 框架可设计 | M2 |
| S-12/13 | core + insight | links/merge（M3 对外）+ 统计读模型 | 框架可设计 | M3 |
| S-14 | insight | 站内通知(M2)/邮件(M3)/策略 | 框架可设计 | M2/M3 |
| S-15/16/17/18 | gateway（已冻结） | GW 认证/RBAC/限流/service-jwt+mTLS | **现可细化**（gateway 详设已冻结） | M2 |
| S-19/20 | core + insight | 事件信封/幂等/健康检查 | 框架可设计 | M2/M3 |
| S-21 | core + insight | admin 配置下沉 core `/config` + insight 策略 | 框架可设计 | M2/M3 |

> 标注口径：**gateway 详设已冻结** → S-15~S-18 可立即进入逐条用例细化；core/insight/web 详设按 PMO 通报分批冻结后，对应场景从"框架"提升到"逐条细化"，再随实现交付提升到"可执行"。

---

## 6. 缺陷回流与复测闭环

- 集成测试发现的**系统详设/契约歧义或缺口** → 直接在对应详设/契约 issue 提缺陷回流，并同步本 issue（按系统详设 §13 决策路由交梁栋裁定）。
- 实现缺陷 → 提缺陷 issue 给对应模块 Leader，标注复现链路 + `trace_id` + 期望/实际；修复后**回归对应 P0/P1 用例 + 关联回归集**方可关闭。
- 验收裁决：按 §1.4 出口门禁；红线用例失败一票驳回。安全测试（渗透+规范符合性）由武安并行承接（SUP-63 方案），本框架的 S-16/S-18 越权/信任红线与其安全用例**对齐去重、互为补充**。

### 本轮设计发现（待确认，非阻塞框架定稿）
1. **D5 watchers/links 对外缺口**：watchers/links 一期不对外（D5），故 S-12 关联/合并对外验证项**仅 M3 激活**；M2 集成回归不纳入对外透出断言 —— 框架已按此标注，无需契约改动，仅提示执行期勿误判为缺陷。
2. **`pending_user` 超时仅提醒不自动关闭**（OQ-8）：S-09/S-10 需显式覆盖"3 天/7 天提醒但状态不变"的负向断言，避免实现误加自动关闭。

---

## 7. 交付与后续

- 本框架为**前置策略设计**，定稿后作为 SUP-72（Alpha/Beta 全量集成回归）执行子任务的输入。
- 各模块详设冻结 → 林桥按本框架逐条细化对应场景用例；实现交付 → 提升 SUP-72/73 执行子任务进入实跑。
- 评审：本框架由本人（严谨，评审第一责任人）发起，拉齐架构（契约一致性裁定）/ 安全（武安，红线去重）评审后定稿。
