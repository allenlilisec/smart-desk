# setup-plan.ps1 — 供 /plan 初始化计划工件并返回路径
# 用法: setup-plan.ps1 -Json
param([switch]$Json)
. (Join-Path $PSScriptRoot 'common.ps1')

$repoRoot = Get-RepoRoot
$featureDir = Get-FeatureDir -RepoRoot $repoRoot
$featureSpec = Join-Path $featureDir 'spec.md'
$implPlan = Join-Path $featureDir 'plan.md'
$template = Join-Path $repoRoot '.specify/templates/plan-template.md'

if (-not (Test-Path $featureSpec)) { Write-Error "缺少 spec.md：请先运行 /speckit-specify"; exit 1 }
if (-not (Test-Path $implPlan) -and (Test-Path $template)) {
    Copy-Item $template $implPlan
}

$payload = [ordered]@{
    REPO_ROOT    = $repoRoot
    FEATURE_SPEC = $featureSpec
    IMPL_PLAN    = $implPlan
    SPECS_DIR    = $featureDir
    BRANCH       = (git -C $repoRoot rev-parse --abbrev-ref HEAD 2>$null)
}
if ($Json) { $payload | ConvertTo-Json -Compress } else { $payload.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" } }
