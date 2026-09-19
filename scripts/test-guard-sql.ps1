$ErrorActionPreference = 'Stop'
$wf = (Get-Content 'C:\Projects\whatsapp-sales-assistant\workflows\01 - Incoming WhatsApp Message.json' -Raw | ConvertFrom-Json)[0]
$q = ($wf.nodes | Where-Object { $_.name -eq 'Own Number Check' }).parameters.query
Write-Host "=== QUERY ==="
Write-Host $q
Write-Host "=== TEST 1: normal customer (LID phone, fresh text) — expect all false ==="
($q -replace '\$1', "'251294258356378'" -replace '\$2', "'goodafternoon'") | docker exec -i -e PGPASSWORD='WafloProd2026!Secure' postgres psql -U waflo -d waflo -f -
Write-Host "=== TEST 2: own business number — expect is_own_number=true, should_block=true ==="
($q -replace '\$1', "'18767998637'" -replace '\$2', "''") | docker exec -i -e PGPASSWORD='WafloProd2026!Secure' postgres psql -U waflo -d waflo -f -
Write-Host "=== TEST 3: echo of bot's own recent outgoing text — expect is_echo=true, should_block=true ==="
($q -replace '\$1', "'251294258356378'" -replace '\$2', "'goodday'") | docker exec -i -e PGPASSWORD='WafloProd2026!Secure' postgres psql -U waflo -d waflo -f -
