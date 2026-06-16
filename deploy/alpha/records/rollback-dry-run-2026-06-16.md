# Alpha/Beta 回滚 dry-run 记录

| 字段 | 值 |
|---|---|
| 执行人 | 万全 |
| 开始时间 (UTC) | 2026-06-16T09:30:20Z |
| 结束时间 (UTC) | 2026-06-16T09:30:57Z |
| 总耗时 | **37s** (~0 min) |
| RTO 目标 (≤15 min) | **达标** |
| LKG 清单 | `lkg/lkg-alpha-mvp.yaml` |
| 模式 | compose 停服 → 切 LKG tag（本地 build 保持）→ 按序 up --no-deps |
| DB 策略 | S1/S3：不执行 down 迁移 |
| P0 探活 | **PASS** |

## 步骤时间线

| 阶段 | 目标 | 实际 |
|---|---|---|
| 决策 | ≤3 min | 模拟即时 |
| 执行（停服+切 LKG+重启） | ≤10 min | 30s 至探活前 |
| 验证（P0 探活） | ≤5 min | 7s |
| 通报 | ≤2 min | 本记录归档 issue |

## P0 验证项

- [x] V-01 四服务 /healthz + /readyz（8/8 探针通过）
- [ ] V-02 登录（需种子账号，SUP-211 后补测）
- [ ] V-03 建单（需种子账号，SUP-211 后补测）

## LKG 镜像 digest（dry-run 后快照）

| 服务 | digest |
|---|---|
| gateway | sha256:f8c71210d534bbd32339e7169df4f1013bb2245d979aca4360b534563bb1835a |
| core | sha256:228124b757abd4fb54852e7f57f07b0ef143742d7e21132888da944a5e994fb5 |
| insight | sha256:2fce392a93a02a3f73e212256a06c65a7a33f213bbe8b88ee2d67fde4b759881 |
| web | sha256:c0d2191c8e6c0fca56a9d2ce450cc602cfedeafd98bc3421aaabf925c77ba4b1 |

## 备注

- 本 dry-run 验证**回滚编排与时限**，不执行 DB down 迁移。
- 登录/建单冒烟待 SUP-211 部署验证通过后追加。
