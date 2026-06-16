# Alpha/Beta health probes (SUP-213)
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot/..

$failed = 0

function Test-Probe {
    param([string]$Name, [scriptblock]$Action)
    try {
        $result = & $Action
        Write-Host "[OK] $Name => $result"
    } catch {
        Write-Host "[FAIL] $Name => $_" -ForegroundColor Red
        $script:failed++
    }
}

Test-Probe "gateway /healthz" { docker compose exec -T gateway wget -qO- http://127.0.0.1:3000/healthz }
Test-Probe "gateway /readyz" { docker compose exec -T gateway wget -qO- http://127.0.0.1:3000/readyz }
Test-Probe "web /healthz" { docker compose exec -T web wget -qO- http://127.0.0.1:3000/healthz }
Test-Probe "core /readyz" { docker compose exec -T gateway wget -qO- http://core:8081/readyz }
Test-Probe "insight /readyz" { docker compose exec -T gateway wget -qO- http://insight:8000/readyz }

Write-Host ""
Write-Host "==> docker compose ps:"
docker compose ps

exit $failed
