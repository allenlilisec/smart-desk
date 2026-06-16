# Alpha/Beta 安全测试接入信息（SUP-212）

> 环境：本地 Docker Compose 隔离全栈（`deploy/alpha`）。与生产/开发网络隔离，专供安全测试与渗透复测。
> 镜像 tag：`alpha-mvp`（清单见 `image-manifest-alpha-mvp.txt`）。

## 1. 对外入口（宿主机可访问）

| 用途 | URL | 说明 |
|---|---|---|
| **Web 门户** | `http://localhost:23001` | Next.js 前端（本机 `.env` 端口；默认模板为 `3001`） |
| **Gateway API** | `http://localhost:28080/api/v1` | BFF / 认证 / 聚合 API（默认模板为 `8080`） |
| Gateway 健康 | `http://localhost:28080/healthz` | Liveness |
| Gateway 就绪 | `http://localhost:28080/readyz` | Readiness |

> 起栈：`cd deploy/alpha && cp .env.example .env && docker compose up -d --build`

## 2. 内网服务地址（渗透范围确认）

以下服务**无宿主机端口映射**，仅 Docker 内网 DNS 可达：

| 服务 | 内网地址 | 网络 | 宿主机直连 |
|---|---|---|---|
| core | `http://core:8081` | `smartdesk-internal` | ❌ 不可达 |
| insight | `http://insight:8000` | `smartdesk-internal` | ❌ 不可达 |
| postgres | `postgres:5432` | `smartdesk-internal` | ❌ |
| redis | `redis:6379` | `smartdesk-internal` | ❌ |
| nats | `nats:4222` | `smartdesk-internal` | ❌ |
| minio | `minio:9000` | `smartdesk-internal` | ❌ |

**硬门禁**：core 对浏览器/外网不可达，仅 gateway（同时接入 internal + edge 网络）可代理访问 core/insight。实测脚本：`scripts/core-isolation-verify.ps1`。

## 3. 测试账号（`GATEWAY_NODE_ENV=development` 种子用户）

| 角色 | 用户名 | 密码 | 说明 |
|---|---|---|---|
| **requester** | `requester1` | `req123` | 提单用户 |
| **agent** | `agent1` | `agent123` | 坐席 |
| **admin** | `admin` | `admin123` | 管理员 |

登录示例：

```bash
curl -s -X POST http://localhost:28080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"requester1","password":"req123"}'
```

## 4. 武安渗透/扫描依赖

| 项 | 位置 |
|---|---|
| 四服务镜像 | `smartdesk-{core,gateway,insight,web}:alpha-mvp` |
| 镜像清单 | `deploy/alpha/image-manifest-alpha-mvp.txt` |
| 监控基线 | `deploy/alpha/monitoring-baseline.md` |
| LKG / 回滚 | `deploy/alpha/lkg-manifest.yaml`、`scripts/rollback-dry-run.ps1` |
| 网络策略 | `deploy/alpha/docker-compose.yml` + `README.md` §网络隔离 |

## 5. 已知限制（渗透预期）

- gateway `POST /api/v1/tickets` 尚未合入（GW-3）；建单须经 core 内网或后续 gateway BFF。
- Alpha 使用本地 IdP 种子用户，非生产 OIDC。
- 本环境为**安全测试全量部署**，无金丝雀分批。
