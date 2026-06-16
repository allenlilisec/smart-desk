# 四服务健康探针 — 对齐 specs/发布监控告警基线.md §2
$ErrorActionPreference = "Stop"
$AlphaDir = Split-Path -Parent $PSScriptRoot
Set-Location $AlphaDir

$envFile = Join-Path $AlphaDir ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)=(.*)$') {
            Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
        }
    }
}

$GatewayPort = if ($env:GATEWAY_PORT) { $env:GATEWAY_PORT } else { "8080" }
$WebPort = if ($env:WEB_PORT) { $env:WEB_PORT } else { "3001" }

$pass = 0
$fail = 0

function Test-Probe {
    param([string]$Name, [scriptblock]$Action)
    try {
        & $Action | Out-Null
        if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { throw "exit $LASTEXITCODE" }
        Write-Host "[PASS] $Name"
        $script:pass++
    } catch {
        Write-Host "[FAIL] $Name"
        $script:fail++
    }
}

function Test-CurlOk {
    param([string]$Url)
    curl.exe -sf --connect-timeout 5 $Url | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "curl failed" }
}

Write-Host "=== SmartDesk Alpha/Beta 健康探针 ==="
Write-Host "gateway port: $GatewayPort | web port: $WebPort"
Write-Host ""

Test-Probe "gateway /healthz" { Test-CurlOk "http://localhost:$GatewayPort/healthz" }
Test-Probe "gateway /readyz"  { Test-CurlOk "http://localhost:$GatewayPort/readyz" }
Test-Probe "web /healthz"     { Test-CurlOk "http://localhost:$WebPort/healthz" }

Test-Probe "core /healthz (internal)" {
    docker compose exec -T gateway wget -qO- http://core:8081/healthz | Out-Null
}
Test-Probe "core /readyz (internal)" {
    docker compose exec -T gateway wget -qO- http://core:8081/readyz | Out-Null
}
Test-Probe "insight /healthz (internal)" {
    docker compose exec -T gateway wget -qO- http://insight:8000/healthz | Out-Null
}
Test-Probe "insight /readyz (internal)" {
    docker compose exec -T gateway wget -qO- http://insight:8000/readyz | Out-Null
}

try {
    curl.exe -sf --connect-timeout 2 "http://localhost:8081/healthz" | Out-Null
    if ($LASTEXITCODE -eq 0) { throw "core exposed" }
    Write-Host "[PASS] core not exposed on host :8081"
    $pass++
} catch {
    if ($_.Exception.Message -eq "core exposed") {
        Write-Host "[FAIL] core exposed on host :8081 (should be blocked)"
        $fail++
    } else {
        Write-Host "[PASS] core not exposed on host :8081"
        $pass++
    }
}

Write-Host ""
Write-Host "=== 基础设施 healthcheck（compose ps）==="
docker compose ps

Write-Host ""
Write-Host "结果: PASS=$pass FAIL=$fail"
if ($fail -gt 0) { exit 1 }
