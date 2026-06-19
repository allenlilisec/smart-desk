# SmartDesk Alpha 环境回滚 Runbook

> 关联：[SUP-339](mention://issue/c3b72089-de79-466c-bbbc-2c3bcbdbf703) · [SUP-342](mention://issue/31b59dfe-d10c-4eb7-a9e8-d942cf52013d)  
> 目标时限：**5 分钟内完成回滚**

---

## 1. 回滚触发条件

以下任一情况发生时，应立即启动回滚流程：

| 条件 | 判定标准 | 检测命令 |
|------|----------|----------|
| **健康检查失败** | 任一服务健康检查连续失败 3 次 | `docker compose -f deploy/docker-compose.alpha.yml ps` |
| **API 路由异常** | `/api/` 返回非 200 状态码 | `curl -sf http://localhost:18080/api/ || echo "FAIL"` |
| **集成测试失败** | SUP-183 端到端测试失败率 > 50% | 查看测试报告 |
| **服务连通性中断** | gateway → core/insight 超时 | `docker compose exec gateway wget -qO- http://core:8080/readyz` |
| **手动触发** | 发布经理（白帆）判定需要回滚 | CTO/发布经理决策 |

---

## 2. 一键回滚步骤

### 2.1 流量止血（1 分钟）

立即停止当前 Alpha 环境所有服务：

```bash
# 1. 进入仓库根目录
cd /path/to/smart-desk

# 2. 停止 Alpha 环境（保留数据卷）
docker compose -f deploy/docker-compose.alpha.yml down

# 3. 验证服务已停止
docker compose -f deploy/docker-compose.alpha.yml ps
# 期望输出：无运行容器
```

### 2.2 镜像回退（2 分钟）

回退到上一稳定版本（LKG - Last Known Good）：

```bash
# 1. 设置上一稳定版本镜像标签
export GATEWAY_IMAGE=allenlilisec/smartdesk-gateway:<LKG_TAG>
export WEB_IMAGE=allenlilisec/smartdesk-web:<LKG_TAG>

# 2. 使用稳定版本重新拉起
docker compose -f deploy/docker-compose.alpha.yml up -d

# 3. 查看启动日志
docker compose -f deploy/docker-compose.alpha.yml logs -f --tail=100
```

### 2.3 数据回滚（可选，1 分钟）

如数据库状态异常需要回滚：

```bash
# 1. 停止服务
docker compose -f deploy/docker-compose.alpha.yml down

# 2. 清理数据卷（谨慎操作！）
docker volume rm smartdesk-alpha_postgres-data smartdesk-alpha_minio-data

# 3. 从备份恢复（如有备份脚本）
# ./deploy/scripts/restore-alpha-db.sh <backup_file>

# 4. 重新拉起
docker compose -f deploy/docker-compose.alpha.yml up -d
```

---

## 3. 回滚后验证（1 分钟）

### 3.1 容器健康状态检查

```bash
# 检查四服务是否全部 healthy
docker compose -f deploy/docker-compose.alpha.yml ps

# 期望输出示例：
# NAME           IMAGE                                     STATUS
# alpha-core     smartdesk-core:latest                     Up 10s (healthy)
# alpha-insight  smartdesk-insight:latest                  Up 10s (healthy)
# alpha-gateway  allenlilisec/smartdesk-gateway:<LKG_TAG>  Up 10s (healthy)
# alpha-web      allenlilisec/smartdesk-web:<LKG_TAG>      Up 10s (healthy)
```

### 3.2 关键路由探测

```bash
# 1. gateway 健康检查
curl -sf http://localhost:18080/api/healthz && echo "OK" || echo "FAIL"

# 2. web 入口健康检查
curl -sf http://localhost:18080/healthz && echo "OK" || echo "FAIL"

# 3. 聚合 API 路由（core/insight 透传）
curl -sf http://localhost:18080/api/readyz && echo "OK" || echo "FAIL"

# 4. 服务间连通性检查
docker compose -f deploy/docker-compose.alpha.yml exec gateway \
  wget -qO- http://core:8080/readyz && echo "gateway->core OK" || echo "FAIL"
docker compose -f deploy/docker-compose.alpha.yml exec gateway \
  wget -qO- http://insight:8000/healthz && echo "gateway->insight OK" || echo "FAIL"
```

### 3.3 P0 冒烟验证

```bash
# 执行冒烟测试脚本（如有）
# ./deploy/scripts/alpha-smoke-test.sh

# 手动 P0 验证清单：
# - [ ] ingress /healthz 返回 200
# - [ ] gateway /api/ 返回 200
# - [ ] web / 页面可访问
# - [ ] core /readyz 返回 200
# - [ ] insight /healthz 返回 200
```

---

## 4. 回滚时限监控

| 阶段 | 目标时间 | 累计时间 |
|------|----------|----------|
| 流量止血 | 1 min | 1 min |
| 镜像回退 | 2 min | 3 min |
| 数据回滚（可选） | 1 min | 4 min |
| 验证通过 | 1 min | **5 min** |

---

## 5. 应急联系

| 角色 | 联系人 | 职责 |
|------|--------|------|
| 发布经理 | 白帆 | 回滚决策、升级协调 |
| CTO | | 技术裁决、重大故障升级 |
| CEO | Allen | 极端阻塞升级 |
| 质量团队 | 何明/韩衡 | 流程合规核查 |

---

## 6. 历史 LKG 版本记录

| 日期 | LKG Tag | 备注 |
|------|---------|------|
| | | 待首次发布后更新 |

---

## 附录：快速命令速查

```bash
# 一键停止
docker compose -f deploy/docker-compose.alpha.yml down

# 一键启动
docker compose -f deploy/docker-compose.alpha.yml up -d

# 查看状态
docker compose -f deploy/docker-compose.alpha.yml ps

# 查看日志
docker compose -f deploy/docker-compose.alpha.yml logs -f

# 重启单个服务
docker compose -f deploy/docker-compose.alpha.yml restart gateway

# 进入容器调试
docker compose -f deploy/docker-compose.alpha.yml exec gateway sh
```
