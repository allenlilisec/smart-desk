# SmartDesk K8s 金丝雀 Ingress 权重路由

> 关联：[SUP-187](mention://issue/e3f9dd7c-20e8-44cb-b2dc-1bf4ed9784c9) · 父 [SUP-170](mention://issue/03f8533d-56b5-40c7-a563-0cd39e42499c)  
> 策略：[`specs/灰度发布策略.md`](../../specs/灰度发布策略.md) · 回滚：[`specs/回滚预案.md`](../../specs/回滚预案.md)

## 概述

本目录提供生产 **K8s** 路径的金丝雀双轨 manifest：

- 四服务（gateway / core / insight / web）各 **stable + canary** Deployment + Service
- Pod 标签 `version=stable|canary` 供 Prometheus SLI 对比
- 入口 Ingress（gateway / web）使用 nginx-ingress **canary 权重注解**实现 C1/C2/C3/rollback
- 无集群时可降级为 `kubectl apply --dry-run=client` / `kubectl kustomize` 验证

## 目录结构

```
deploy/k8s/
├── base/
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── gateway/          # deployment-stable/canary + service + ingress
│   ├── core/
│   ├── insight/
│   ├── web/
│   └── kustomization.yaml
├── overlays/
│   ├── c1/               # canary weight = 5
│   ├── c2/               # canary weight = 25
│   ├── c3/               # canary weight = 100
│   └── rollback/         # canary weight = 0
└── scripts/
    ├── canary-stage.sh
    └── verify-split.sh
```

## 前置条件

- K8s 集群已部署 **nginx-ingress-controller**（支持 `nginx.ingress.kubernetes.io/canary*` 注解）
- 镜像已推送至集群可访问的 registry；当前 manifest 使用占位镜像 `smartdesk/<service>:{stable,canary}`
- 共享依赖（PostgreSQL / Redis / NATS / MinIO）已在 `smartdesk-canary` namespace 就绪

## 快速开始

```bash
# 从仓库根目录执行
# 1. 渲染并检查 C1 配置
kubectl kustomize deploy/k8s/overlays/c1 | less

# 2. 有集群时干跑验证
kubectl apply -k deploy/k8s/overlays/c1 --dry-run=client

# 3. 真正部署（需集群）
kubectl apply -k deploy/k8s/overlays/c1
```

## C1 / C2 / C3 / rollback 切换

| 阶段 | canary 权重 | 命令 |
|---|---|---|
| **C1** | 5% | `./deploy/k8s/scripts/canary-stage.sh c1` |
| **C2** | 25% | `./deploy/k8s/scripts/canary-stage.sh c2` |
| **C3** | 100% | `./deploy/k8s/scripts/canary-stage.sh c3` |
| **Rollback** | 0% | `./deploy/k8s/scripts/canary-stage.sh rollback` |

> **放量须 CTO 人工确认**（G2–G4），脚本仅切换权重，不自动推进批次。

### 验证权重

```bash
./deploy/k8s/scripts/verify-split.sh c1
# 输出渲染后的 gateway-canary / web-canary 权重并与期望值比对
```

## 替换真实镜像

推荐通过 kustomize overlay 或 CI/CD 替换镜像 registry/tag：

```yaml
# overlays/production/kustomization.yaml
images:
  - name: smartdesk/gateway
    newName: registry.example.com/smartdesk-gateway
    newTag: v0.2.0-m2
  - name: smartdesk/core
    newName: registry.example.com/smartdesk-core
    newTag: v0.2.0-m2
  # ...
```

## 已知限制（D1 跟进项）

- **core / insight 未接入入口流量分割**：当前 nginx ingress 仅路由 gateway/web；gateway→core/insight 的调用走 Kubernetes Service（无权重）。接真实镜像前需补齐：
  - gateway 内 client-side 权重路由，或
  - 服务网格（Istio/Linkerd）VirtualService/DestinationRule，或
  - 独立 canary Service + gateway 配置动态切换
- 此项已记录为 C2/C3 放量前复核点。

## 回滚

```bash
./deploy/k8s/scripts/canary-stage.sh rollback
```

完整回滚还需将 Deployment 镜像切回 LKG tag，并执行 [`specs/回滚预案.md`](../../specs/回滚预案.md) §4.2/§5 P0 冒烟。

## 验收

- [x] `kubectl kustomize` 渲染后 canary-weight 与 C1/C2/C3/rollback 期望一致
- [x] 脚本 `./deploy/k8s/scripts/verify-split.sh {c1|c2|c3|rollback}` 通过
- [ ] `kubectl apply -k deploy/k8s/overlays/<stage> --dry-run=client` 通过（需可用集群）
- [ ] 真实集群部署验证（待集群就绪）
