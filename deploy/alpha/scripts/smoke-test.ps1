# quickstart Happy Path smoke (SUP-211)
# Uses in-container HTTP to avoid Docker Desktop host port latency on Windows.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot/..

function Invoke-GatewayJson {
    param([string]$Method, [string]$Path, [string]$Body = "", [string]$Token = "")
    $tokenArg = if ($Token) { $Token } else { "" }
    $bodyArg = if ($Body) { $Body.Replace('"', '\"') } else { "" }
    $script = @"
const http=require('http');
const opts={hostname:'127.0.0.1',port:3000,path:'$Path',method:'$Method',headers:{'Content-Type':'application/json'}};
const h=opts.headers;
if('$tokenArg') h.Authorization='Bearer $tokenArg';
const data='$bodyArg';
if(data) h['Content-Length']=Buffer.byteLength(data);
const req=http.request(opts,res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>process.stdout.write(res.statusCode+'\n'+b));});
req.on('error',e=>{console.error(e);process.exit(1)});
if(data) req.write(data);
req.end();
"@
    $out = docker compose exec -T gateway node -e $script
    $lines = $out -split "`n", 2
    return @{ Status = [int]$lines[0]; Body = $lines[1] }
}

Write-Host "==> Step 1: POST /api/v1/auth/login"
$login = Invoke-GatewayJson -Method POST -Path "/api/v1/auth/login" -Body '{"username":"requester1","password":"req123"}'
if ($login.Status -ne 200) { throw "login failed: $($login.Status) $($login.Body)" }
$token = ($login.Body | ConvertFrom-Json).access_token
Write-Host "[OK] login => 200, token received"

Write-Host ""
Write-Host "==> Step 1b: GET /api/v1/auth/me"
$meResp = Invoke-GatewayJson -Method GET -Path "/api/v1/auth/me" -Token $token
if ($meResp.Status -ne 200) { throw "me failed: $($meResp.Body)" }
$me = $meResp.Body | ConvertFrom-Json
Write-Host "[OK] me => user=$($me.username)"

Write-Host ""
Write-Host "==> Step 2: core POST /tickets 201 (gateway BFF POST /tickets pending GW-3)"
$coreScript = @"
const http=require('http');
const data=JSON.stringify({title:'Alpha smoke',description:'SUP-211',priority:'P3'});
const req=http.request({hostname:'core',port:8081,path:'/tickets',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data),'X-User-Id':'$($me.user_id)','X-User-Roles':'requester'}},res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>console.log(res.statusCode+' '+b));});
req.write(data);req.end();
"@
$coreCreate = docker compose exec -T gateway node -e $coreScript
Write-Host $coreCreate
if ($coreCreate -notmatch "^201 ") { throw "core create failed: $coreCreate" }
Write-Host "[OK] core POST /tickets => 201"

Write-Host ""
Write-Host "==> Step 3: insight /readyz via gateway network"
$insight = docker compose exec -T gateway wget -qO- http://insight:8000/readyz
Write-Host "[OK] insight /readyz => $insight"

Write-Host ""
Write-Host "==> SUP-211 smoke PASSED"
