# 红黑事件台账

> 质量管理团队维护：对事不对人、无责记录。
> 红 = 亮点/值得推广的做法；黑 = 问题/需要改进的漂移或返工。

## 记录格式

| 字段 | 说明 |
|---|---|
| 编号 | RB-YYYYMMDD-NNN（日期 + 当日序号） |
| 类型 | 红 / 黑 |
| 来源 | 触发事件的 issue、巡检、评审或复盘 |
| 事件 | 一句话概括 |
| 影响范围 | 涉及的服务/模块/团队 |
| 根因 | 简要根因分析 |
| 改进项 | 已创建或待创建的改进 issue |
| 状态 | 跟踪中 / 已关闭 / 待验证 |
| 记录人 | 记录者 |

---

## 事件记录

### RB-20260618-001（黑）

- **类型**：黑
- **来源**：[SUP-313](mention://issue/5944bf76-fa2c-42e2-9442-15016690e731) 改进项：跨服务端点路径一致性检查机制
- **事件**：SUP-303 架构裁决后，insight PR #14 仍基于已废弃路径调用 core 用户目录，导致 `GET /config/users/{userId}` 与最终契约 `GET /internal/users/{userId}` 不一致。
- **影响范围**：smartdesk-insight、smartdesk-core、api-contract-check、SUP-310 合入门禁。
- **根因**：
  1. SUP-303 裁决落地过程中先出现 `/config/users/{userId}` 中间口径，后统一为 `/internal/users/{userId}`；
  2. insight 实现分支在口径统一前已编码并进入评审，未在合入前与最终契约做交叉核对；
  3. 集体检视门禁缺少"跨服务调用路径与 OpenAPI 契约一致"的必检项。
- **改进项**：
  - SUP-310：将 insight core 客户端路径修正为 `/internal/users/{userId}` 并更新主仓 submodule 指针；
  - SUP-309：确认 core `/internal/users/{userId}` 实现 commit 已 push 并 bump 到主仓；
  - SUP-313：将"跨服务调用路径与 OpenAPI 契约一致"纳入集体检视门禁必检项。
- **状态**：跟踪中
- **记录人**：韩衡
- **时间线**：
  - 2026-06-17 21:46：睿恒效能巡检发现 SUP-310 PR #14 使用 `/config/users/{userId}`，与 core 实现/契约口径漂移。
  - 2026-06-18 06:06：苏睿在 smartdesk-insight `927438a` 提交修正路径为 `/internal/users/{userId}`。
  - 2026-06-18 06:10：韩衡确认修正提交存在，但 smart-desk 主仓 submodule 指针仍指向旧 commit `8ece078`，且 core 实现 commit `62938b55` 在本地/远程均不可达，需继续跟踪闭环。
