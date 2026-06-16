# SmartDesk Alpha/Beta 集成测试用例集（SUP-183）

> **版本**：v1.0　|　日期：2026-06-16　|　编制：林桥（集成测试工程师）
> **事实源**：
> - 本文件是 [SUP-183](mention://issue/b30e1927-d7bb-45b3-bd76-32d282fb7ef8) 交付件，与 [SUP-163](mention://issue/971e5872-dee2-494a-a82d-909fe7634fa9) `specs/testing/alpha-beta-integration-cases-sup163.md` 可测性评审互为补充。
> - 策略框架：[`SmartDesk集成测试策略与用例框架.md`](./SmartDesk集成测试策略与用例框架.md)（SUP-62）
> - 接口契约：`src/openapi/{gateway,core,insight}.yaml`
> - 失败处理/缺陷分级：[SUP-72](mention://issue/ca4f80fa-f223-444e-ae9d-0ffaff714574)

## 1. 目标与范围

### 1.1 目标
为 D1~D3 冲刺的 Alpha/Beta 集成测试提供可直接执行的用例集、环境基线、执行计划与验收结论模板。

### 1.2 范围
| 阶段 | 时间 | 目标 | 用例范围 |
|---|---|---|---|
| Alpha | D1 下午 ~ D2 上午 | 服务间联调冒烟 + 核心链路贯通 | P0 主流程 18 条 |
| Beta | D2 下午 ~ D3 | 端到端业务流程 + UAT 支持 | P0 全量 + P1 异常分支 + P2 边界 |

### 1.3 不在本任务范围
- 单元测试、安全渗透测试（武安负责 [SUP-63](mention://issue/34432295-4a78-44c3-9ab6-959ffcb42ad3)）
- 性能/负载测试（若需单独方案，另起 issue）

---

## 2. 环境基线与准入条件

### 2.1 Alpha 环境（D1 上午准入）
| 组件 | 版本/配置要求 | 状态 | 阻塞项 |
|---|---|---|---|
| gateway | `main` 最新，JWT/RBAC/service-jwt 已合入 | 待确认 | SUP-112 / SUP-194 |
| core | `main` 最新，状态机/分派/SLA/outbox 已合入 | 待确认 | SUP-169 outbox 闭环 |
| insight | `main` 最新，事件消费/分类建议/站内通知 | 待确认 | SUP-113 schema 冻结 |
| web | `main` 最新，报单门户 + 坐席工作台 MVP | 待确认 | SUP-165 WEB-0 |
| NATS | 部署完成，topic 与 core/insight 订阅对齐 | 待确认 | 部署基线 |
| mTLS | gateway ↔ core/insight 服务间通道启用 | 待确认 | SUP-194 / SUP-196 |
| MailHog | 测试环境邮件替身可访问 | 待确认 | SMTP 选型 |

### 2.2 Beta 环境（D2 上午准入）
在 Alpha 基线之上增加：
- 完整 RBAC 角色数据（requester/agent/manager/admin）
- 真实或模拟外发邮件网关
- 监控告警基线就绪（SUP-213）
- 灰度/回滚预案就绪（SUP-210）

### 2.3 测试账号与数据
| 角色 | 数量 | 用途 |
|---|---|---|
| requester | ≥2 | 提单、查询、评论、CSAT |
| agent | ≥2 | 受理、处理、分派、内部备注 |
| manager | ≥1 | 分派调整、越权负向用例 |
| admin | ≥1 | 配置变更、角色管理 |
| service account | ≥1 | service-jwt / mTLS 正向/负向 |

---

## 3. 用例总览

### 3.1 优先级定义
| 优先级 | 定义 | Alpha | Beta | 失败处置 |
|---|---|---|---|---|
| P0 | 主流程 / 架构红线 | 100% 跑 | 100% 通过 | 任一失败即驳回 |
| P1 | 异常分支 / 安全负向 | 抽取关键项 | 100% 通过 | 100% 通过方可准出 |
| P2 | 边界 / 并发 / 性能 | 不跑 | ≥95% 通过 | 未达需缺陷评估 |

### 3.2 场景 × 阶段矩阵

| 场景 ID | 场景名称 | 优先级 | Alpha | Beta | 依赖 / 阻塞 |
|---|---|---|---|---|---|
| S-01 | 登录与会话管理 | P0 | ✔ | ✔ | gateway JWT 就绪 |
| S-02 | RBAC 权限控制 | P0 | ✔ | ✔ | gateway RBAC 矩阵就绪 |
| S-03 | 智能分类建议写回 | P0 | 框架 | ✔ | insight schema 冻结（G-1/G-8） |
| S-04 | 工单创建与视图 | P0 | ✔ | ✔ | core ticket API 就绪 |
| S-05 | 工单状态机流转 | P0 | ✔ | ✔ | core state machine 就绪 |
| S-06 | 工单分派与再分派 | P0 | ✔ | ✔ | core assignment 就绪 |
| S-07 | 评论与内部备注可见性 | P0 | ✔ | ✔ | core comment API 就绪 |
| S-08 | 附件上传与下载 | P0 | ✔ | ✔ | core/web 附件就绪 |
| S-09 | SLA 计时与暂停 | P1 | 抽取 | ✔ | core SLA engine 就绪 |
| S-10 | 客户侧门户交互 | P0 | ✔ | ✔ | web requester portal 就绪 |
| S-11 | 坐席工作台交互 | P0 | ✔ | ✔ | web agent desk 就绪 |
| S-12 | 通知触发与消费 | P1 | 抽取 | ✔ | NATS + MailHog 就绪 |
| S-13 | 统计报表数据一致性 | P2 | 不跑 | 抽取 | insight stats 就绪 |
| S-14 | 邮件通知可靠性 | P1 | 不跑 | ✔ | SMTP/ MailHog 就绪 |
| S-15 | 认证与会话边界 | P0 | ✔ | ✔ | gateway auth 就绪 |
| S-16 | 越权访问红线 | P0 | ✔ | ✔ | gateway RBAC 矩阵就绪 |
| S-17 | 限流与熔断 | P1 | 抽取 | ✔ | gateway rate-limit 就绪 |
| S-18 | 服务间信任边界 | P1 | 不跑 | ✔ | service-jwt + mTLS 就绪 |
| S-19 | 事件可靠性与幂等 | P1 | 抽取 | ✔ | NATS + outbox 就绪 |
| S-20 | 数据一致性与回滚 | P2 | 不跑 | 抽取 | core/insight 持久化就绪 |
| S-21 | 降级与容错 | P2 | 不跑 | 抽取 | gateway fallback 就绪 |

> **说明**：标注"框架"的场景在 Alpha 只跑正向主路径，字段级断言待依赖闭环后补齐。

---

## 4. P0 Alpha 必跑用例详单（18 条）

### S-01 登录与会话管理
**T-001 正常登录获取 JWT**
- 前置：gateway 部署，测试账号存在
- 步骤：POST /auth/login → 200，返回 access_token/refresh_token
- 期望：token 含 user_id/roles/exp；refresh_token 与 access_token 不同

**T-002 token 刷新**
- 步骤：使用 refresh_token POST /auth/refresh → 200
- 期望：返回新 access_token，旧 token 不失效（按策略）

### S-02 RBAC 权限控制
**T-003 requester 只能访问自己工单**
- 步骤：requester A 查询 requester B 的工单详情
- 期望：403

### S-03 智能分类建议写回（框架级）
**T-004 分类建议事件到达 core**
- 前置：insight 已发布 `insight.classification_suggested` 事件
- 步骤：构造 core 写回消费消息，调用写回接口
- 期望：202 Accepted，建议记录可见（字段级断言待 schema 冻结后补齐）

### S-04 工单创建与视图
**T-005 requester 创建工单**
- 步骤：POST /tickets，body 含 title/description/category_id
- 期望：201，返回 ticket_id，状态为 open

**T-006 获取工单详情**
- 步骤：GET /tickets/{id}
- 期望：200，字段与创建一致，含状态/创建时间/请求人

### S-05 工单状态机流转
**T-007 open → in_progress → resolved → closed**
- 步骤：agent 依次转换状态
- 期望：每次 200，状态正确，时间线记录完整

**T-008 非法状态跃迁返回 409**
- 步骤：requester 尝试将 closed 工单 reopen
- 期望：409，状态不变

### S-06 工单分派与再分派
**T-009 manager 分派工单给 agent**
- 步骤：POST /tickets/{id}/assignments
- 期望：201，返回 assignment_id/to_user_id

**T-010 再分派更新当前受理人**
- 步骤：manager 将同一工单再分派给另一 agent
- 期望：200/201，当前受理人更新，历史分派保留

### S-07 评论与内部备注可见性
**T-011 agent 添加内部备注**
- 步骤：POST /tickets/{id}/comments，is_internal=true
- 期望：201，requester 不可见该评论

**T-012 requester 添加公开评论**
- 步骤：POST /tickets/{id}/comments，is_internal=false
- 期望：201，双方可见

### S-08 附件上传与下载
**T-013 上传合法附件**
- 步骤：POST /tickets/{id}/attachments，5MB PDF
- 期望：201，返回 url，下载内容一致

### S-10 客户侧门户交互
**T-014 requester 门户查看工单列表**
- 步骤：以 requester 登录 web，访问工单列表
- 期望：列表仅展示该用户工单，分页正常

### S-11 坐席工作台交互
**T-015 agent 工作台处理工单**
- 步骤：以 agent 登录 web，打开待处理工单，更新状态为 in_progress
- 期望：状态同步，时间线刷新

### S-15 认证与会话边界
**T-016 无 token 访问受保护接口**
- 步骤：不带 Authorization 头 GET /tickets
- 期望：401

**T-017 过期 token 访问**
- 步骤：使用过期/伪造 token
- 期望：401

### S-16 越权访问红线
**T-018 agent 尝试调用 admin 配置接口**
- 步骤：agent POST /config/categories
- 期望：403

---

## 5. Beta 扩展用例（P1/P2 精选）

### P1 异常分支（Beta 全量）
- S-09 T-019 SLA 暂停后恢复计时正确
- S-09 T-020 优先级变更后 SLA 重算
- S-12 T-021 重复事件去重（按 event_id）
- S-14 T-022 邮件发送失败重试 3 次后进死信
- S-17 T-023 限流触发 429
- S-18 T-024 缺失 service-jwt 直连 core 被拒绝
- S-19 T-025 幂等 Key 重复请求返回一致结果

### P2 边界场景（Beta 抽检）
- S-08 T-026 20MB 临界附件上传
- S-05 T-027 7/8 天 reopen 边界
- S-03 T-028 0.85 confidence 临界分类建议
- S-05 T-029 并发状态冲突处理
- S-13 T-030 统计最终一致性阈值

---

## 6. 执行计划

### 6.1 D1（Alpha）
| 时间 | 动作 | 责任人 |
|---|---|---|
| 上午 | 环境准入检查（§2.1） | 林桥 + 部署 |
| 下午 | 执行 P0 Alpha 18 条 | 林桥 |
| 晚间 | 输出 D1 测试报告，缺陷建单 | 林桥 |

### 6.2 D2（Beta 启动）
| 时间 | 动作 | 责任人 |
|---|---|---|
| 上午 | Beta 环境准入检查（§2.2） | 林桥 + 部署 |
| 下午 | 执行 P0 全量 + P1 异常分支 | 林桥 |
| 晚间 | 输出 D2 测试报告 | 林桥 |

### 6.3 D3（Beta 收尾）
| 时间 | 动作 | 责任人 |
|---|---|---|
| 上午 | P2 边界场景抽检 | 林桥 |
| 下午 | 回归测试 + 汇总最终验收结论 | 林桥 |
| 晚间 | 输出最终报告，更新 issue 状态 | 林桥 |

---

## 7. 阻塞与升级策略

| 阻塞项 | 影响 | 升级路径 |
|---|---|---|
| SUP-169 core outbox 未闭环 | S-12/S-19 无法执行 | 在 [SUP-183](mention://issue/b30e1927-d7bb-45b3-bd76-32d282fb7ef8) 置 blocked，@程远 升级 |
| SUP-113 insight schema 未冻结 | S-03/S-13 字段级断言缺失 | 置 blocked，@程远 协调架构/insight |
| SMTP/MailHog 未就绪 | S-14 无法执行 | 置 blocked，@程远 升级 |
| NATS/mTLS 未就绪 | S-18/S-19 无法执行 | 置 blocked，@程远 升级 |
| 环境准入失败 | 整阶段阻塞 | 立即 @程远 |

---

## 8. 每日测试报告模板

```markdown
## SUP-183 D{N} 测试报告（{日期}）

### 执行概况
- 计划用例：N
- 执行用例：N
- 通过：N / 失败：N / 阻塞：N
- 通过率：N%

### P0 结果
| 场景 | 通过 | 失败 | 阻塞 |
|---|---|---|---|
| S-01 | ✔ | - | - |
| ... | | | |

### 缺陷清单
| ID | 级别 | 归属 | 状态 |
|---|---|---|---|
| BUG-xxx | P0 | core | open |

### 阻塞项
- xxx（@程远）

### 明日计划
- xxx
```

---

## 9. 验收结论模板

```markdown
## SUP-183 最终集成测试验收结论

- Alpha 结论：通过 / 有条件通过 / 不通过
- Beta 结论：通过 / 有条件通过 / 不通过
- 遗留风险：xxx
- 建议：xxx
- 签署：林桥
```

---

## 10. 变更记录

| 版本 | 日期 | 变更说明 | 作者 |
|---|---|---|---|
| v1.0 | 2026-06-16 | 初始版本，含 Alpha/Beta 用例集、环境基线、执行计划与报告模板 | 林桥 |
