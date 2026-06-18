# SmartDesk 灰度门禁脚本 (Canary Gates)

本目录包含 SmartDesk M4 灰度发布的门禁观测脚本，用于 G1-G5 检查清单执行和 D-01~D-06 dry-run。

## 脚本说明

### 1. check-health.sh
健康检查脚本，验证四服务（gateway/core/insight/web）的 Liveness 和 Readiness。

```bash
./check-health.sh [gateway_url] [timeout_secs]
# Returns: 0=pass, 1=fail
```

**对应门禁**: H-3 (Readiness), H-5 (Canary probe)

### 2. check-metrics.sh
Prometheus 指标检查脚本，对照 H-* 暂停和 R-* 回滚阈值。

```bash
./check-metrics.sh [prometheus_url] [stage]
# Returns: 0=pass, 1=hold (H-*), 2=rollback (R-*)
```

**检查项**:
- H-1: 5xx 错误率 > 1%
- H-2: P95 延迟 > 800ms
- H-4: 事件消费滞后 > 60s
- R-1: 5xx 错误率 > 5%
- R-2: 建单成功率 < 99%
- SLI-01: 建单成功率 ≥ 99.9%
- SLI-03: 事件消费滞后 < 60s

### 3. check-gates.sh
G1-G5 检查清单脚本，输出 pass/fail + 待人类确认项。

```bash
./check-gates.sh [gate]
# gate: g1|g2|g3|g4|g5|all
# Returns: 0=pass, 1=fail
```

**门禁说明** (详见 specs/灰度发布策略.md §7):
- **G1**: 灰度启动前检查 (LKG确认、策略签字、告警配置、回滚预案)
- **G2**: C1 (5%) 启动检查 (预发验证、镜像就绪、健康检查)
- **G3**: C1→C2 推进检查 (观测窗口、P0/P1清零、SLI达标)
- **G4**: C2→C3 推进检查 (观测窗口、P0/P1清零、SLI-05达标)
- **G5**: C3 (100%) 全量发布检查 (观测窗口、全量SLI、CTO确认)

**注意**: 告警清零 ≠ 自动放量。每批推进须 CTO 人工确认。

### 4. dry-run.sh
D-01~D-06 staging dry-run 执行脚本。

```bash
./dry-run.sh [scenario]
# scenario: d01|d02|d03|d04|d05|d06|all
```

**场景说明** (详见 specs/灰度发布策略.md §9):

| 场景 | 描述 | 预期结果 |
|------|------|----------|
| D-01 | C1 5% 正常放量 | 观测窗口 15min 无 H/R 触发 |
| D-02 | 注入 5xx 触发 H-1 | 暂停放量、不推进 C2 |
| D-03 | 注入延迟触发 H-2 | 暂停放量 |
| D-04 | 停止 NATS 触发 H-4 | 事件消费滞后暂停 |
| D-05 | 模拟建单失败触发 R-2 | 强制回滚至 LKG |
| D-06 | G3 人类确认流程演练 | CTO 确认后方可推进 |

## 使用示例

### 运行单个门禁检查
```bash
# G2 检查（C1 启动前）
./check-gates.sh g2

# 健康检查
./check-health.sh http://localhost:8080

# 指标检查（C1 阶段）
./check-metrics.sh http://localhost:9090 c1
```

### 运行 Dry-Run 场景
```bash
# D-01: C1 正常放量
cd scripts/canary-gates
./dry-run.sh d01

# 全部 Dry-Run
./dry-run.sh all
```

### 在 CI/CD 中使用
```bash
# 灰度推进前检查
if ./check-gates.sh g3; then
    echo "G3 通过，提请 CTO 确认"
else
    echo "G3 未通过，停止推进"
    exit 1
fi
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `GATEWAY_URL` | http://localhost:8080 | Gateway 地址 |
| `PROM_URL` | http://localhost:9090 | Prometheus 地址 |
| `INGRESS_PORT` | 19080 | Ingress 端口 |
| `COMPOSE_FILE` | deploy/docker-compose.canary.yml | Compose 文件路径 |

## 依赖

- `curl`: HTTP 请求
- `jq`: JSON 解析（用于 check-metrics.sh）
- `bc`: 数值计算（用于 check-metrics.sh）
- Docker Compose: 用于 dry-run 场景

## 关联文档

- [灰度发布策略](../../specs/灰度发布策略.md) - 完整策略文档
- [回滚预案](../../specs/回滚预案.md) - 一键回滚预案
- [发布监控告警基线](../../specs/发布监控告警基线.md) - P0/P1 告警分级
