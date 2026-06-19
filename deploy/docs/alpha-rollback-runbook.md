# Alpha 环境一键回滚 Runbook

> 文档版本：v1.0  
> 关联 Issue：[SUP-342](mention://issue/31b59dfe-d10c-4eb7-a9e8-d942cf52013d)  
> 父 Issue：[SUP-339](mention://issue/c3b72089-de79-466c-bbbc-2c3bcbdbf703)  
> 最后更新：2026-06-19

---

## 1. 回滚触发条件

当满足以下任一条件时，**立即触发回滚**，无需等待 CTO 确认：

| 条件类型 | 检查项 | 触发阈值 |
|---------|--------|----------|
| **健康检查失败** | 四服务（core / insight / gateway / web）容器健康状态 | 任一服务 `unhealthy` 持续 >30s |
| **API 路由异常** | `/api/` 路由返回码 | 返回 404 或 5xx 错误 |
| **集成测试失败** | 冒烟测试/集成测试失败率 | 失败率 >50% 或 P0 用例失败 |
| **人工触发** | CTO/值班工程师判定 | 环境异常影响演示/验收 |

### 1.1 快速检查命令

```bash
# 1. 检查四服务健康状态
./deploy/scripts/alpha-health-check.sh

# 2. 检查 API 路由
curl -sf http://localhost:18080/api/healthz && echo "OK" || echo "FAIL"

# 3. 运行冒烟测试
./deploy/scripts/alpha-smoke-test.sh
```

---

## 2. 回滚步骤

### Step 1: 停止当前服务（30 秒）

```bash
# 停止 Alpha 环境所有服务
docker compose -f deploy/docker-compose.alpha.yml down

# 预期输出：
# [+] Running 5/5
#  ⠿ Container smartdesk-alpha-web-1      Removed
#  ⠿ Container smartdesk-alpha-gateway-1   Removed
#  ⠿ Container smartdesk-alpha-insight-1   Removed
#  ⠿ Container smartdesk-alpha-core-1     Removed
```

### Step 2: 清理数据卷（可选，10 秒）

> ⚠️ **警告**：仅在确认数据卷损坏或需要完全重置时执行

```bash
# 查看现有卷
docker volume ls | grep smartdesk

# 清理未使用的卷（谨慎执行）
docker volume prune -f

# 如需清理特定卷（如数据损坏）
docker volume rm smartdesk-alpha-postgres-data 2>/dev/null || true
```

### Step 3: 拉取上一稳定版本镜像（30 秒）

```bash
# 设置上一稳定版本标签（根据实际部署历史调整）
export STABLE_TAG="${STABLE_TAG:-latest}"

# 拉取各服务稳定版本镜像
docker pull smartdesk/core:${STABLE_TAG}
docker pull smartdesk/insight:${STABLE_TAG}
docker pull smartdesk/gateway:${STABLE_TAG}
docker pull smartdesk/web:${STABLE_TAG}

# 验证镜像存在
docker images | grep smartdesk
```

### Step 4: 重启服务并验证健康状态（120 秒）

```bash
# 启动 Alpha 环境
docker compose -f deploy/docker-compose.alpha.yml up -d

# 等待依赖服务就绪（最多 60 秒）
echo "Waiting for dependencies..."
sleep 10

# 验证四服务健康状态
./deploy/scripts/alpha-health-check.sh
```

---

## 3. 验证步骤

### 3.1 容器状态验证

```bash
# 检查所有容器状态
docker compose -f deploy/docker-compose.alpha.yml ps

# 预期输出：四服务均为 healthy
# NAME                          STATUS
# smartdesk-alpha-core-1        running (healthy)
# smartdesk-alpha-insight-1       running (healthy)
# smartdesk-alpha-gateway-1       running (healthy)
# smartdesk-alpha-web-1           running (healthy)
```

### 3.2 API 路由验证

```bash
# 验证 /api/ 路由返回 200
curl -sf http://localhost:18080/api/healthz && echo "✓ API healthz OK"

# 验证聚合路由
curl -sf http://localhost:18080/api/v1/status && echo "✓ API status OK"
```

### 3.3 关键功能冒烟测试

```bash
# 运行完整冒烟测试套件
./deploy/scripts/alpha-smoke-test.sh

# 预期结果：
# ✓ Core 服务健康检查
# ✓ Insight 服务健康检查
# ✓ Gateway BFF 聚合路由
# ✓ Web 前端可访问
# ✓ 端到端数据流测试
```

---

## 4. 回滚时限

| 阶段 | 目标时间 | 最大容忍 |
|-----|---------|---------|
| 停止当前服务 | 30s | 60s |
| 拉取稳定镜像 | 30s | 90s |
| 启动并验证 | 120s | 180s |
| **总计** | **~3 分钟** | **~5 分钟** |

> **目标：5 分钟内完成回滚并验证通过**

---

## 5. 一键回滚脚本

创建 `deploy/scripts/alpha-rollback.sh`：

```bash
#!/usr/bin/env bash
# Alpha 环境一键回滚脚本
set -euo pipefail

COMPOSE_FILE="deploy/docker-compose.alpha.yml"
STABLE_TAG="${STABLE_TAG:-latest}"
INGRESS_PORT="${INGRESS_PORT:-18080}"

echo "=== Alpha 环境回滚开始 ==="
echo "目标版本: ${STABLE_TAG}"
echo "开始时间: $(date '+%Y-%m-%d %H:%M:%S')"

# Step 1: 停止当前服务
echo "[1/4] 停止当前服务..."
docker compose -f "$COMPOSE_FILE" down --remove-orphans
echo "✓ 服务已停止"

# Step 2: 拉取稳定镜像（可选，如使用本地镜像可跳过）
echo "[2/4] 拉取稳定版本镜像..."
# docker compose -f "$COMPOSE_FILE" pull
echo "✓ 镜像准备完成"

# Step 3: 启动服务
echo "[3/4] 启动 Alpha 环境..."
STABLE_TAG="$STABLE_TAG" docker compose -f "$COMPOSE_FILE" up -d
echo "✓ 服务已启动"

# Step 4: 健康检查
echo "[4/4] 验证服务健康状态..."
sleep 5

# 等待服务就绪（最多 120 秒）
for i in {1..24}; do
    if curl -sf "http://localhost:${INGRESS_PORT}/api/healthz" > /dev/null 2>&1; then
        echo "✓ API 健康检查通过"
        break
    fi
    echo "  等待服务就绪... (${i}/24)"
    sleep 5
done

# 最终验证
echo ""
echo "=== 回滚验证 ==="
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "=== Alpha 环境回滚完成 ==="
echo "完成时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "访问地址: http://localhost:${INGRESS_PORT}/"
```

**使用方法：**

```bash
# 快速回滚到 latest 标签
./deploy/scripts/alpha-rollback.sh

# 回滚到指定版本
STABLE_TAG=v1.2.3 ./deploy/scripts/alpha-rollback.sh
```

---

## 6. 故障排查

### 6.1 服务无法启动

```bash
# 查看服务日志
docker compose -f deploy/docker-compose.alpha.yml logs --tail=50 core
docker compose -f deploy/docker-compose.alpha.yml logs --tail=50 insight

# 检查依赖服务状态
docker compose -f deploy/docker-compose.alpha.yml ps postgres redis nats
```

### 6.2 健康检查失败

```bash
# 手动执行健康检查
docker exec smartdesk-alpha-core-1 wget -qO- http://localhost:8080/healthz
docker exec smartdesk-alpha-insight-1 wget -qO- http://localhost:8000/healthz
```

### 6.3 网络/端口冲突

```bash
# 检查端口占用
netstat -tlnp | grep 18080

# 清理残留网络
docker network prune -f
```

---

## 7. 联系人与升级

| 场景 | 联系人 | 升级路径 |
|-----|-------|---------|
| 回滚失败 | CTO | CTO → CEO |
| 数据损坏 | 运维团队 | 运维 Leader → CTO |
| 环境问题 | 值班工程师 | 值班 Leader → CTO |

---

## 8. 变更记录

| 版本 | 日期 | 变更内容 | 作者 |
|-----|------|---------|-----|
| v1.0 | 2026-06-19 | 初始版本 | 万全 |

