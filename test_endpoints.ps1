param()
$loginBody = Get-Content -Path '.\login.json' -Raw
$loginResp = Invoke-WebRequest -Uri 'http://localhost:4000/api/auth/login' -Method POST -Body $loginBody -ContentType 'application/json' -TimeoutSec 10
$loginData = $loginResp.Content | ConvertFrom-Json
$token = $loginData.data.token
Write-Host "=== Login ==="
if ($token.Length -gt 20) { Write-Host "Token received: YES" } else { Write-Host "Token received: NO" }

$headers = @{ 'Authorization' = "Bearer $token" }

Write-Host ""
Write-Host "=== GET /api/settings ==="
$settingsResp = Invoke-WebRequest -Uri 'http://localhost:4000/api/settings' -Headers $headers -TimeoutSec 10
$settingsData = $settingsResp.Content | ConvertFrom-Json
Write-Host ("Settings count: " + $settingsData.Count)
foreach ($s in $settingsData) { Write-Host ("  - " + $s.setting_key + " = " + $s.setting_value) }

Write-Host ""
Write-Host "=== GET /api/staff/users ==="
$staffResp = Invoke-WebRequest -Uri 'http://localhost:4000/api/staff/users' -Headers $headers -TimeoutSec 10
$staffData = $staffResp.Content | ConvertFrom-Json
Write-Host ("Staff count: " + $staffData.data.Count)
foreach ($u in $staffData.data) { Write-Host ("  - " + $u.display_name + " <" + $u.email + "> role=" + $u.role + " status=" + $u.status) }

Write-Host ""
Write-Host "=== GET /api/stats/dashboard ==="
$dashResp = Invoke-WebRequest -Uri 'http://localhost:4000/api/stats/dashboard' -Headers $headers -TimeoutSec 10
$dashData = $dashResp.Content | ConvertFrom-Json
Write-Host ("Dashboard conversations.total: " + $dashData.data.conversations.total)

Write-Host ""
Write-Host "=== PUT /api/settings (auto_reply_enabled -> false) ==="
$updateBody = '{"setting_key":"auto_reply_enabled","setting_value":"false"}'
$updateResp = Invoke-WebRequest -Uri 'http://localhost:4000/api/settings' -Method PUT -Body $updateBody -Headers $headers -ContentType 'application/json' -TimeoutSec 10
$updateData = $updateResp.Content | ConvertFrom-Json
Write-Host ("Updated: " + $updateData.setting_key + " = " + $updateData.setting_value)

