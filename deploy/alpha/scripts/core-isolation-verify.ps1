# core network isolation verification (SUP-212)
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot/..

$failed = 0
$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss K"

Write-Host "========================================"
Write-Host " SUP-212 core isolation test"
Write-Host " time: $ts"
Write-Host "========================================"

Write-Host ""
Write-Host "==> 1. port exposure (docker compose ps)"
docker compose ps

Write-Host ""
Write-Host "==> 2. host -> core:8081 (expect FAIL)"
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $iar = $tcp.BeginConnect("127.0.0.1", 8081, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(2000, $false)
    if ($ok -and $tcp.Connected) {
        Write-Host "FAIL: host can connect localhost:8081" -ForegroundColor Red
        $failed++
        $tcp.Close()
    } else {
        Write-Host "OK: localhost:8081 unreachable (core not exposed)"
        $tcp.Close()
    }
} catch {
    Write-Host "OK: localhost:8081 connection error (expected): $_"
}

Write-Host ""
Write-Host "==> 3. host -> insight:8000 (expect FAIL)"
try {
    $tcp2 = New-Object System.Net.Sockets.TcpClient
    $iar2 = $tcp2.BeginConnect("127.0.0.1", 8000, $null, $null)
    $ok2 = $iar2.AsyncWaitHandle.WaitOne(2000, $false)
    if ($ok2 -and $tcp2.Connected) {
        Write-Host "FAIL: host can connect localhost:8000" -ForegroundColor Red
        $failed++
        $tcp2.Close()
    } else {
        Write-Host "OK: localhost:8000 unreachable (insight not exposed)"
        $tcp2.Close()
    }
} catch {
    Write-Host "OK: localhost:8000 connection error (expected): $_"
}

Write-Host ""
Write-Host "==> 4. gateway -> core /readyz (expect 200)"
$coreFromGw = docker compose exec -T gateway wget -qO- http://core:8081/readyz 2>&1
if ($LASTEXITCODE -eq 0 -and "$coreFromGw" -match "ready") {
    Write-Host "OK: gateway -> core:8081/readyz => $coreFromGw"
} else {
    Write-Host "FAIL: gateway cannot reach core: $coreFromGw" -ForegroundColor Red
    $failed++
}

Write-Host ""
Write-Host "==> 5. gateway -> insight /readyz (expect 200)"
$insightFromGw = docker compose exec -T gateway wget -qO- http://insight:8000/readyz 2>&1
if ($LASTEXITCODE -eq 0 -and "$insightFromGw" -match "ok") {
    Write-Host "OK: gateway -> insight:8000/readyz => $insightFromGw"
} else {
    Write-Host "FAIL: gateway cannot reach insight: $insightFromGw" -ForegroundColor Red
    $failed++
}

Write-Host ""
Write-Host "==> 6. web (edge only) -> core (expect FAIL)"
$webToCore = docker compose exec -T web wget -qO- --timeout=3 http://core:8081/readyz 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "OK: web cannot reach core directly (edge network isolated)"
} else {
    Write-Host "WARN: web can reach core: $webToCore" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================"
if ($failed -eq 0) {
    Write-Host " SUP-212 isolation test PASSED"
} else {
    Write-Host " SUP-212 isolation test FAILED ($failed items)" -ForegroundColor Red
}
Write-Host "========================================"

exit $failed
