# Alpha/Beta 隔离 docker-compose 栈

专供安全测试与集成验证的**隔离全栈**，对齐 [`specs/001-smartdesk-system/quickstart.md`](../../specs/001-smartdesk-system/quickstart.md) 起栈顺序。

## 网络隔离（硬门禁）

| 网络 | `internal` | 成员 | 宿主机端口 |
|---|---|---|---|
| `smartdesk-internal` | 否（无 `internal:true`¹） | postgres / redis / nats / minio / **core** / insight / gateway（内网段） | **core/中间件无映射** |
| `smartdesk-edge` | 否 | gateway / web | **有**（见下表） |

¹ Docker 限制：挂接 `internal:true` 网络的容器无法向宿主机发布端口；gateway 需同时接入内网段与 edge 才能既访问 core 又对外暴露 API，故内网段采用**零端口映射**实现隔离，而非 `internal:true`。

**core 零宿主机端口映射**，且仅加入 `smartdesk-internal`，从宿主机/外网不可直连。仅 gateway（API）与 web（门户）对外暴露。

### 端口暴露清单

| 服务 | 容器端口 | 宿主机映射 | 对外 |
|---|---|---|---|
| **gateway** | 3000 | `${GATEWAY_PORT:-8080}` | ✅ API `/api/v1` |
| **web** | 3000 | `${WEB_PORT:-3001}` | ✅ 门户 |
| core | 8081 | — | ❌ 内部 only |
| insight | 8000 | — | ❌ 内部 only |
| postgres | 5432 | — | ❌ |
| redis | 6379 | — | ❌ |
| nats | 4222 | — | ❌ |
| minio | 9000 | — | ❌ |

## 前置条件

- Docker Engine 24+ 与 Docker Compose v2
- 已初始化子模块：`git submodule update --init --recursive`

## 一键起栈

```bash
cd deploy/alpha
cp .env.example .env
docker compose up -d --build
```

## 健康探针

```bash
# 对外服务
curl -sf http://localhost:8080/healthz && curl -sf http://localhost:8080/readyz
curl -sf http://localhost:3001/healthz

# 验证 core 无宿主机端口（应连接失败）
curl -sf --connect-timeout 2 http://localhost:8081/healthz && echo UNEXPECTED || echo "core not exposed OK"

# 容器内从 gateway 探测 core（应成功）
docker compose exec gateway wget -qO- http://core:8081/readyz
```

全部中间件与四服务 `healthy` 后：

```bash
docker compose ps
```

## 起栈顺序

1. 中间件：postgres → redis → nats → minio
2. core（迁移 + 种子数据）→ `/readyz`
3. insight（连 PG + NATS）→ `/readyz`
4. gateway（连 Redis）→ `/readyz`
5. web（指向 gateway `/api/v1`）

## 停止与清理

```bash
docker compose down
# 含数据卷清理：
docker compose down -v
```

## 回滚参考

镜像 tag 回退流程见 [`specs/回滚预案.md`](../../specs/回滚预案.md) §4.4。
