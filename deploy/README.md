# SmartDesk 金丝雀双轨预发部署

> 关联：[SUP-186](mention://issue/119e1a28-6514-4451-9222-49cdaf828738) · [SUP-170](mention://issue/03f8533d-56b5-40c7-a563-0cd39e42499c)  
> 策略：[`specs/灰度发布策略.md`](../specs/灰度发布策略.md) · 回滚：[`specs/回滚预案.md`](../specs/回滚预案.md) §4.4

## 概述

本目录提供 **docker-compose 预发环境**的金丝雀双轨骨架：

- 四服务（gateway / core / insight / web）各 **stable + canary** 实例
- **按副本数比例近似流量分割**：compose `deploy.replicas` 定义 stable/canary 副本比，nginx upstream 每个服务一条 server；Docker DNS 将服务名解析为所有副本 IP，nginx 按 IP 数等权分发，实现 OQ-CANARY-1 预发方案
- 容器/Pod 标签 `version=stable|canary` 供 Prometheus SLI 对比
- 骨架期使用 `healthz-stub` 占位；CORE-0 Checkpoint 后替换为真实镜像

## 快速开始

```bash
# 从仓库根目录执行
docker compose -f deploy/docker-compose.canary.yml up -d --build

# 健康检查
curl -sf http://localhost:19080/api/    # 经 nginx 分流到 gateway
curl -sf http://localhost:19080/       # 经 nginx 分流到 web

# 四服务 stub 直连（调试）
docker compose -f deploy/docker-compose.canary.yml exec core-stable wget -qO- http://localhost:8080/healthz
```

## C1 / C2 / C3 切换

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

## 替换真实镜像

骨架验收后，将各服务 `build: ./healthz-stub` 替换为：

```yaml
image: registry/smartdesk-gateway:${STABLE_TAG}  # stable 实例
image: registry/smartdesk-gateway:${CANARY_TAG}  # canary 实例
```

环境变量：

| 变量 | 说明 | 默认 |
|---|---|---|
| `STABLE_TAG` | LKG 镜像 tag | `latest` |
| `CANARY_TAG` | 待验证镜像 tag | `canary` |
| `INGRESS_PORT` | 入口端口 | `19080` |
| `*_STABLE_REPLICAS` / `*_CANARY_REPLICAS` | 各服务副本数 | C1: 19:1 |

## 回滚操作（对齐回滚预案 §4.4）

1. **流量止血**：`./deploy/scripts/canary-stage.sh rollback`（100% stable）
2. **镜像回退**：更新 compose 中 `CANARY_TAG` 为 LKG tag 并 `docker compose up -d`
3. **健康验证**：四服务 `/healthz` + `/readyz` 全 200
4. **P0 冒烟**：见回滚预案 §5.1 V-01~V-08

回滚顺序（与起栈相反）：`web → gateway → insight → core`

## 文件结构

```
deploy/
├── docker-compose.canary.yml   # 双轨 compose 主文件（deploy.replicas 定义副本比）
├── nginx/
│   ├── nginx.conf              # upstream server 列表模板
│   └── docker-entrypoint.sh    # 按副本数生成等权 upstream server
├── healthz-stub/               # 骨架期占位服务
├── scripts/
│   ├── canary-stage.sh         # C1/C2/C3/rollback 切换（环境变量改 replicas + ingress 重建）
│   └── verify-split.sh         # 分流比例验证
└── README.md
```

## 验收清单（D-01~D-02）

- [x] `docker compose up` 四服务双轨 + 依赖全部 Running
- [x] C1 分流比例 ≈ 5%（`verify-split.sh`）
- [x] C2 切换后分流比例 ≈ 25%
- [x] `rollback` 后 100% stable
- [x] Prometheus 可按 `version` 标签区分 stable/canary 指标
