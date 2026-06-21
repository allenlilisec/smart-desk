# SmartDesk 部署配置

> 关联：[SUP-186](mention://issue/119e1a28-6514-4451-9222-49cdaf828738) · [SUP-170](mention://issue/03f8533d-56b5-40c7-a563-0cd39e42499c) · [SUP-339](mention://issue/c3b72089-de79-466c-bbbc-2c3bcbdbf703)  
> 策略：[`specs/灰度发布策略.md`](../specs/灰度发布策略.md) · 回滚：[`specs/回滚预案.md`](../specs/回滚预案.md) §4.4

---

## 环境概览

| 环境 | 配置文件 | 模式 | 用途 |
|------|----------|------|------|
| **Canary** | `docker-compose.canary.yml` | 双轨（stable/canary） | 预发灰度发布 |
| **Alpha** | `docker-compose.alpha.yml` | 单轨 | SUP-183 集成测试验收基线 |

---

## Alpha 环境（单轨）

> 详见：[SUP-339](mention://issue/c3b72089-de79-466c-bbbc-2c3bcbdbf703) · 回滚：[alpha-rollback-runbook.md](./docs/alpha-rollback-runbook.md)

### 概述

Alpha 环境提供**真实四服务（core / insight / gateway / web）单实例**运行环境，用于 SUP-183 Alpha/Beta 端到端集成测试验收。

特点：
- 单轨模式（区别于 canary 双轨），每个服务只运行一个实例
- 使用真实镜像（非 healthz-stub）
- 配置完整健康检查，容器状态可观测
- 配套回滚 Runbook，目标 5 分钟内完成回滚

### 快速开始

```bash
# 从仓库根目录执行
# 1) 生成 Alpha 密钥（SERVICE_JWT 密钥对 + CORE_SERVICE_TOKEN + JWT_SECRET）
python deploy/scripts/generate-alpha-secrets.py

# 2) 拉起环境
docker compose -f deploy/docker-compose.alpha.yml --env-file deploy/alpha/.env up -d --build

# 查看服务状态
docker compose -f deploy/docker-compose.alpha.yml ps

# 健康检查
curl -sf http://localhost:18080/api/healthz && echo "gateway OK"
curl -sf http://localhost:18080/healthz && echo "web OK"
curl -sf http://localhost:18080/api/readyz && echo "core OK"

# 查看日志
docker compose -f deploy/docker-compose.alpha.yml logs -f
```

### 服务架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Alpha 环境                            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐                                            │
│  │   ingress   │  Port: 18080                               │
│  │   (nginx)   │  Routes: /api/* → gateway, / → web         │
│  └──────┬──────┘                                            │
│         │                                                    │
│    ┌────┴────┐                                               │
│    ▼         ▼                                               │
│ ┌──────┐  ┌──────┐                                          │
│ │gateway│  │ web  │                                          │
│ │:3001 │  │:3002 │                                          │
│ └──┬───┘  └──────┘                                          │
│    │                                                         │
│    ▼                                                         │
│ ┌──────────────────────────────────────────┐                │
│ │              Backend Services             │                │
│ │  ┌─────────┐  ┌─────────┐  ┌─────────┐  │                │
│ │  │  core   │  │ insight │  │postgres │  │                │
│ │  │ :8080   │  │ :8000   │  │ :5432   │  │                │
│ │  └─────────┘  └─────────┘  └─────────┘  │                │
│ │  ┌─────────┐  ┌─────────┐              │                │
│ │  │  redis  │  │  nats   │              │                │
│ │  │ :6379   │  │ :4222   │              │                │
│ │  └─────────┘  └─────────┘              │                │
│ └──────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

### 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `GATEWAY_IMAGE` | Gateway 镜像 | `allenlilisec/smartdesk-gateway:latest` |
| `WEB_IMAGE` | Web 镜像 | `allenlilisec/smartdesk-web:latest` |
| `INGRESS_PORT` | 入口端口 | `18080` |
| `GATEWAY_PORT` | Gateway 直连端口 | `3001` |
| `WEB_PORT` | Web 直连端口 | `3002` |
| `NEXT_PUBLIC_USE_MOCK` | Web 浏览器端 Mock 开关（Alpha 固定关闭） | `false` |
| `NEXT_PUBLIC_API_BASE_URL` | Web 浏览器端 Gateway BFF 基址（经 ingress 同域转发） | `/api/v1` |
| `API_BASE_URL` | Web 服务端 Gateway BFF 基址（容器内直连） | `http://gateway:3000/api/v1` |

#### Alpha 服务密钥（SUP-375 / SUP-376）

运行 `deploy/scripts/generate-alpha-secrets.py` 生成 `deploy/alpha/.env`（已 gitignore）。与 gateway `ServiceJwtService` 对齐：

| 变量 | 消费方 | 说明 |
|------|--------|------|
| `SERVICE_JWT_PRIVATE_KEY` | gateway | RS256 私钥，运行时签发 `aud=insight` 的 per-request service-jwt |
| `SERVICE_JWT_PUBLIC_KEY` | insight | 验签 gateway→insight 入站调用 |
| `CORE_SERVICE_JWT_PUBLIC_KEY` | core | 验签 `aud=core` 的 service-jwt（与上列公钥相同） |
| `CORE_SERVICE_TOKEN` | insight | 预签发静态 token（`aud=core`，insight→core `/internal/users/{id}`） |
| `JWT_SECRET` | gateway | 用户会话 JWT 签名（≥32 字节随机值） |

`CORE_SERVICE_TOKEN` 由脚本用与 gateway 相同的私钥签发，`sub=00000000-0000-4000-8000-000000000001`（Alpha insight 服务身份），`roles=["admin"]`，`org_id=default`，TTL 365 天。

### 回滚操作

详见 [alpha-rollback-runbook.md](./docs/alpha-rollback-runbook.md)

```bash
# 一键回滚（停止当前环境）
docker compose -f deploy/docker-compose.alpha.yml down

# 使用 LKG 版本重新拉起
export GATEWAY_IMAGE=allenlilisec/smartdesk-gateway:<LKG_TAG>
export WEB_IMAGE=allenlilisec/smartdesk-web:<LKG_TAG>
docker compose -f deploy/docker-compose.alpha.yml up -d

# 验证健康状态
docker compose -f deploy/docker-compose.alpha.yml ps
```

---

## Canary 环境（双轨）

> 详见：[`specs/灰度发布策略.md`](../specs/灰度发布策略.md)

### 概述

本目录提供 **docker-compose 预发环境**的金丝雀双轨骨架：

- 四服务（gateway / core / insight / web）各 **stable + canary** 实例
- **按副本数比例近似流量分割**：compose `deploy.replicas` 定义 stable/canary 副本比，nginx upstream 每个服务一条 server；Docker DNS 将服务名解析为所有副本 IP，nginx 按 IP 数等权分发，实现 OQ-CANARY-1 预发方案
- 容器/Pod 标签 `version=stable|canary` 供 Prometheus SLI 对比

### 快速开始

```bash
# 从仓库根目录执行
docker compose -f deploy/docker-compose.canary.yml up -d --build

# 健康检查
curl -sf http://localhost:19080/api/    # 经 nginx 分流到 gateway
curl -sf http://localhost:19080/       # 经 nginx 分流到 web

# 四服务直连（调试）
docker compose -f deploy/docker-compose.canary.yml exec core-stable wget -qO- http://localhost:8080/healthz
```

### C1 / C2 / C3 切换

| 阶段 | 流量比 | stable:canary 副本比 | 命令 |
|---|---|---|---|
| **C1** | ~5% | 19:1 | `./deploy/scripts/canary-stage.sh c1` |
| **C2** | ~25% | 3:1 | `./deploy/scripts/canary-stage.sh c2` |
| **C3** | 100% | 0:1（全 canary） | `./deploy/scripts/canary-stage.sh c3` |
| **回滚** | 0% canary | 1:0（全 stable / LKG） | `./deploy/scripts/canary-stage.sh rollback` |

> **放量须 CTO 人工确认**（G2–G4），脚本仅切换副本比，不自动推进批次。

### 验证分流比例

```bash
./deploy/scripts/verify-split.sh http://localhost:19080/api/ 200
# 期望：C1 ≈ 5%±容差、C2 ≈ 25%±容差
```

### 环境变量

| 变量 | 说明 | 默认 |
|---|---|---|
| `NATS_CORE_PASSWORD` | core NATS 凭证（必填，禁明文入仓） | — |
| `NATS_INSIGHT_PASSWORD` | insight NATS 凭证（必填） | — |
| `STABLE_TAG` | LKG 镜像 tag | `latest` |
| `CANARY_TAG` | 待验证镜像 tag | `canary` |
| `INGRESS_PORT` | 入口端口 | `19080` |
| `*_STABLE_REPLICAS` / `*_CANARY_REPLICAS` | 各服务副本数 | C1: 19:1 |

### 回滚操作（对齐回滚预案 §4.4）

1. **流量止血**：`./deploy/scripts/canary-stage.sh rollback`（100% stable）
2. **镜像回退**：更新 compose 中 `CANARY_TAG` 为 LKG tag 并 `docker compose up -d`
3. **健康验证**：四服务 `/healthz` + `/readyz` 全 200
4. **P0 冒烟**：见回滚预案 §5.1 V-01~V-08

回滚顺序（与起栈相反）：`web → gateway → insight → core`

### NATS 安全收口（SUP-324）

起栈前生成自签 CA 并注入凭证（示例见 `deploy/nats.env.example`）：

```bash
bash deploy/nats/generate-certs.sh
export NATS_CORE_PASSWORD='...'
export NATS_INSIGHT_PASSWORD='...'
docker compose -f deploy/docker-compose.canary.yml up -d --build
# 可选验收：bash deploy/nats/verify-nats-security.sh
```

要点：4222 启用 TLS + 账户 ACL；8222 仅绑定容器 loopback；gateway 不连 NATS。

---

## 文件结构

```
deploy/
├── docker-compose.alpha.yml    # Alpha 单轨 compose（SUP-339）
├── docker-compose.canary.yml   # 金丝雀双轨 compose 主文件
├── nats/                       # NATS 鉴权/ACL/TLS（SUP-324）
├── nats.env.example            # NATS 凭证环境变量模板
├── nginx/
│   ├── nginx.conf              # canary upstream server 列表模板
│   ├── docker-entrypoint.sh    # canary 按副本数生成等权 upstream
│   └── alpha-nginx.conf        # Alpha 环境 nginx 配置
├── healthz-stub/               # 骨架期占位服务
├── scripts/
│   ├── canary-stage.sh         # C1/C2/C3/rollback 切换
│   └── verify-split.sh         # 分流比例验证
├── docs/
│   └── alpha-rollback-runbook.md  # Alpha 回滚 Runbook
├── core/
│   └── Dockerfile              # core 服务构建
└── README.md
```

---

## 验收清单

### Alpha 环境（SUP-339）

- [ ] `docker compose up` 四服务 + 依赖全部 healthy
- [ ] `/api/` 路由返回 200
- [ ] `/` 路由返回 200
- [ ] 回滚 Runbook 已验证（目标 5 分钟内完成）

### Canary 环境（SUP-186）

- [x] `docker compose up` 四服务双轨 + 依赖全部 Running
- [x] C1 分流比例 ≈ 5%（`verify-split.sh`）
- [x] C2 切换后分流比例 ≈ 25%
- [x] `rollback` 后 100% stable
- [x] Prometheus 可按 `version` 标签区分 stable/canary 指标
