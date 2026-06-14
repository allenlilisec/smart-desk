# common.ps1 — 共享辅助：定位 repo 根、活动 feature 目录
# spec-kit (SUP-43) · 维护：架构设计团队

function Get-RepoRoot {
    $dir = Get-Location
    while ($dir -and -not (Test-Path (Join-Path $dir '.specify'))) {
        $parent = Split-Path $dir -Parent
        if ($parent -eq $dir) { break }
        $dir = $parent
    }
    return $dir.Path ?? (Get-Location).Path
}

function Get-FeatureDir {
    param([string]$RepoRoot)
    $featureJson = Join-Path $RepoRoot '.specify/feature.json'
    if (Test-Path $featureJson) {
        $obj = Get-Content $featureJson -Raw | ConvertFrom-Json
        if ($obj.feature_directory) {
            return (Join-Path $RepoRoot $obj.feature_directory)
        }
    }
    # 回退：扫描 specs/ 下编号最大的目录
    $specs = Join-Path $RepoRoot 'specs'
    $cand = Get-ChildItem $specs -Directory | Where-Object { $_.Name -match '^\d{3}-' } | Sort-Object Name | Select-Object -Last 1
    if ($cand) { return $cand.FullName }
    throw "无法定位 feature 目录：请先运行 /speckit-specify"
}
