# smartdesk-gateway

SmartDesk 对外 API 网关（NestJS）：JWT 认证、RBAC 收口、BFF 聚合。

## 当前进度

| 模块 | 状态 | 说明 |
|---|---|---|
| GW-1 认证 | ✅ MVP | login/refresh/logout/me、JWT、Redis/内存会话、`LocalIdentityProvider` + IdP 抽象 |
| GW-2 RBAC | ✅ MVP | 角色×动作矩阵、`RbacGuard`、403 审计埋点、越权用例 stub 路由 |
| GW-3 聚合 BFF | ⏳ 待 core 就绪 | tickets/admin 路由为 stub，后续接 core/insight |
| GW-4 限流 | ⏳ | |
| GW-5 服务令牌 | ⏳ | |

## 快速启动

```bash
cd src/smartdesk-gateway
cp .env.example .env
npm install
npm run start:dev
```

- 健康检查：`GET /healthz`
- API 前缀：`/api/v1`（契约见 `openapi/gateway.yaml`）

## 种子账号（Local IdP）

| 用户名 | 密码 | 角色 |
|---|---|---|
| admin | admin123 | admin |
| agent1 | agent123 | agent |
| requester1 | req123 | requester |
| requester2 | req123 | requester |
| manager1 | mgr123 | manager |

## 测试

```bash
npm test
npm run test:e2e
```

## 配置

见 `.env.example`。`REDIS_ENABLED=false` 时使用进程内内存存储（本地开发）；生产应启用 Redis。
