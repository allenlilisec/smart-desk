# 构建四服务镜像并打 alpha-mvp tag（SUP-211）
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot/..

$tag = if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { "alpha-mvp" }
Write-Host "==> Building images with tag: $tag"

docker compose build core insight gateway web
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n==> Tagged images:"
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}" |
    Select-String "smartdesk-(core|gateway|insight|web)"

# 归档镜像清单（供武安镜像基线扫描）
$manifest = @(
    "smartdesk-core:$tag",
    "smartdesk-gateway:$tag",
    "smartdesk-insight:$tag",
    "smartdesk-web:$tag"
)
$manifest | Set-Content -Encoding utf8 "./image-manifest-$tag.txt"
Write-Host "`nManifest written to deploy/alpha/image-manifest-$tag.txt"
