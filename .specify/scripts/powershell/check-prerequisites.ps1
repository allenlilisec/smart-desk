# check-prerequisites.ps1 — 供 /clarify /plan /tasks 定位 feature 工件并校验前置
# 用法: check-prerequisites.ps1 -Json [-PathsOnly] [-RequireTasks] [-IncludeTasks]
param(
    [switch]$Json,
    [switch]$PathsOnly,
    [switch]$RequireTasks,
    [switch]$IncludeTasks
)
. (Join-Path $PSScriptRoot 'common.ps1')

$repoRoot = Get-RepoRoot
$featureDir = Get-FeatureDir -RepoRoot $repoRoot
$featureSpec = Join-Path $featureDir 'spec.md'
$implPlan = Join-Path $featureDir 'plan.md'
$tasks = Join-Path $featureDir 'tasks.md'

if (-not (Test-Path $featureSpec)) {
    Write-Error "缺少 spec.md（$featureSpec）：请先运行 /speckit-specify"; exit 1
}
if ($RequireTasks -and -not (Test-Path $tasks)) {
    Write-Error "缺少 tasks.md：请先运行 /speckit-tasks"; exit 1
}

$payload = [ordered]@{
    REPO_ROOT    = $repoRoot
    FEATURE_DIR  = $featureDir
    FEATURE_SPEC = $featureSpec
    IMPL_PLAN    = $implPlan
    TASKS        = $tasks
    SPECS_DIR    = (Join-Path $repoRoot 'specs')
    BRANCH       = (git -C $repoRoot rev-parse --abbrev-ref HEAD 2>$null)
}
if ($PathsOnly) {
    $payload = [ordered]@{ FEATURE_DIR = $featureDir; FEATURE_SPEC = $featureSpec; IMPL_PLAN = $implPlan; TASKS = $tasks }
}
if ($Json) { $payload | ConvertTo-Json -Compress } else { $payload.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" } }
