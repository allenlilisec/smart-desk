# create-new-feature.ps1 — 供 /specify 创建新 feature 目录与 spec.md 起点
# 用法: create-new-feature.ps1 -ShortName "smartdesk-system" [-Json]
param(
    [Parameter(Mandatory = $true)][string]$ShortName,
    [switch]$Json
)
. (Join-Path $PSScriptRoot 'common.ps1')

$repoRoot = Get-RepoRoot
$specs = Join-Path $repoRoot 'specs'
if (-not (Test-Path $specs)) { New-Item -ItemType Directory -Path $specs | Out-Null }

$existing = Get-ChildItem $specs -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^(\d{3})-' }
$next = 1
if ($existing) { $next = ([int[]]($existing | ForEach-Object { [int]($_.Name.Substring(0,3)) }) | Measure-Object -Maximum).Maximum + 1 }
$prefix = '{0:D3}' -f $next
$dirName = "$prefix-$ShortName"
$featureDir = Join-Path $specs $dirName
New-Item -ItemType Directory -Path $featureDir -Force | Out-Null

$specFile = Join-Path $featureDir 'spec.md'
$template = Join-Path $repoRoot '.specify/templates/spec-template.md'
if (-not (Test-Path $specFile) -and (Test-Path $template)) { Copy-Item $template $specFile }

@{ feature_directory = "specs/$dirName" } | ConvertTo-Json | Set-Content (Join-Path $repoRoot '.specify/feature.json') -Encoding utf8

$payload = [ordered]@{ FEATURE_DIR = $featureDir; SPEC_FILE = $specFile; FEATURE_NUM = $prefix }
if ($Json) { $payload | ConvertTo-Json -Compress } else { $payload.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" } }
