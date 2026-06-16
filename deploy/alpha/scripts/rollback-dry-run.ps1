# compose 环境一键回滚 dry-run（SUP-213，对齐回滚预案 §4.4）
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot/..

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$lkgTag = if ($env:LKG_TAG) { $env:LKG_TAG } else { "alpha-mvp-lkg" }
$currentTag = if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { "alpha-mvp" }

Write-Host "==> 0. 记录当前 tag=$currentTag，模拟回滚目标 LKG_TAG=$lkgTag"
Write-Host "    （dry-run：为当前镜像打 lkg 别名后滚动重启）"

# 为当前四服务镜像打 LKG 别名（不拉取远端）
$services = @("core", "gateway", "insight", "web")
foreach ($svc in $services) {
    $src = "smartdesk-${svc}:$currentTag"
    $dst = "smartdesk-${svc}:$lkgTag"
    docker tag $src $dst 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Tag $src not found, building first..."
        docker compose build $svc
        docker tag $src $dst
    }
    Write-Host "  tagged $dst"
}

Write-Host "`n==> 1. 滚动重启（web → gateway → insight → core）"
$order = @("web", "gateway", "insight", "core")
$env:IMAGE_TAG = $lkgTag
foreach ($svc in $order) {
    docker compose stop $svc
    docker compose up -d --no-deps $svc
    if ($LASTEXITCODE -ne 0) { throw "restart failed: $svc" }
    Write-Host "  restarted $svc"
}

Write-Host "`n==> 2. 等待健康探针"
Start-Sleep -Seconds 25
& "$PSScriptRoot/health-check.ps1"
if ($LASTEXITCODE -ne 0) { throw "health-check failed after rollback" }

$sw.Stop()
$elapsed = [math]::Round($sw.Elapsed.TotalMinutes, 1)
Write-Host "`n==> 回滚 dry-run 完成，耗时 ${elapsed} min（RTO 目标 ≤15 min）"
if ($elapsed -gt 15) { Write-Host "WARN: 超过 15 min RTO 目标" -ForegroundColor Yellow }

# 恢复当前 tag 运行
$env:IMAGE_TAG = $currentTag
docker compose up -d core insight gateway web
