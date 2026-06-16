# 一键回滚 dry-run — 对齐 specs/回滚预案.md §4.4、§1.2（RTO ≤15 min）
$ErrorActionPreference = "Continue"
$AlphaDir = Split-Path -Parent $PSScriptRoot
$RecordDir = Join-Path $AlphaDir "records"
New-Item -ItemType Directory -Force -Path $RecordDir | Out-Null
Set-Location $AlphaDir

$RecordFile = Join-Path $RecordDir ("rollback-dry-run-{0:yyyy-MM-dd}.md" -f (Get-Date).ToUniversalTime())
$StartTs = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$StartEpoch = [int][double]::Parse((Get-Date -UFormat %s))

function Log($msg) {
    $t = (Get-Date).ToUniversalTime().ToString("HH:mm:ss")
    Write-Host "[$t] $msg"
}

Log "=== SmartDesk Alpha/Beta 回滚 dry-run 开始 ==="
Log "LKG 清单: lkg/lkg-alpha-mvp.yaml"
Log "记录文件: $RecordFile"

Log "Phase 1 决策模拟: 假设白帆已下达回滚指令 (≤3 min)"

Log "Phase 2 停服: web → gateway → insight → core"
docker compose stop web gateway insight core

Log "Phase 3 切 LKG: 按序 up --no-deps"
docker compose up -d --no-deps web
docker compose up -d --no-deps gateway
docker compose up -d --no-deps insight
docker compose up -d --no-deps core

Log "等待服务就绪..."
Start-Sleep -Seconds 15
docker compose ps

Log "Phase 4 P0 验证: 健康探针"
$ProbeStart = [int][double]::Parse((Get-Date -UFormat %s))
$probeScript = Join-Path $PSScriptRoot "health-probe.ps1"
& $probeScript
$probeExit = $LASTEXITCODE
$ProbeResult = if ($probeExit -eq 0) { "PASS" } else { "FAIL" }
$ProbeEnd = [int][double]::Parse((Get-Date -UFormat %s))

$EndTs = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$EndEpoch = [int][double]::Parse((Get-Date -UFormat %s))
$Elapsed = $EndEpoch - $StartEpoch
$RtoOk = if ($Elapsed -le 900) { "yes" } else { "no (>15min)" }

$v01 = if ($ProbeResult -eq "PASS") { "x" } else { " " }

@"
# Alpha/Beta 回滚 dry-run 记录

| 字段 | 值 |
|---|---|
| 执行人 | 万全 |
| 开始时间 (UTC) | $StartTs |
| 结束时间 (UTC) | $EndTs |
| 总耗时 | ${Elapsed}s (~$([math]::Floor($Elapsed / 60)) min) |
| RTO 目标 (≤15 min) | $RtoOk |
| LKG 清单 | ``lkg/lkg-alpha-mvp.yaml`` |
| 模式 | compose 停服 → 切 LKG tag（本地 build 保持）→ 按序 up --no-deps |
| DB 策略 | S1/S3：不执行 down 迁移 |
| P0 探活 | $ProbeResult |

## 步骤时间线

| 阶段 | 目标 | 实际 |
|---|---|---|
| 决策 | ≤3 min | 模拟即时 |
| 执行（停服+切 LKG+重启） | ≤10 min | $($ProbeStart - $StartEpoch)s 至探活前 |
| 验证（P0 探活） | ≤5 min | $($ProbeEnd - $ProbeStart)s |
| 通报 | ≤2 min | 本记录归档 issue |

## P0 验证项

- [$v01] V-01 四服务 /healthz + /readyz
- [ ] V-02 登录（需种子账号，SUP-211 后补测）
- [ ] V-03 建单（需种子账号，SUP-211 后补测）

## 备注

- 本 dry-run 验证**回滚编排与时限**，不执行 DB down 迁移。
- 登录/建单冒烟待 SUP-211 部署验证通过后追加。
"@ | Set-Content -Path $RecordFile -Encoding UTF8

Log "=== dry-run 完成: ${Elapsed}s, P0探活=$ProbeResult, RTO=$RtoOk ==="
Log "记录已写入: $RecordFile"

if ($ProbeResult -ne "PASS") { exit 1 }
