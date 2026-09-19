$ErrorActionPreference = 'Stop'
$path = 'C:\Projects\whatsapp-sales-assistant\workflows\01 - Incoming WhatsApp Message.json'
$json = Get-Content $path -Raw | ConvertFrom-Json
$wf = if ($json -is [array]) { $json[0] } else { $json }
$n = $wf.nodes | Where-Object { $_.name -eq 'Upsert Contact' }
$new = '={{ $(''Sanitize Inputs'').first().json.phone }}, {{ $(''Sanitize Inputs'').first().json.customer_name }}, {{ $(''Sanitize Inputs'').first().json.business_phone }}'
$n.parameters.options | Add-Member -NotePropertyName queryReplacement -NotePropertyValue $new -Force
$json | ConvertTo-Json -Depth 30 | Set-Content $path -Encoding UTF8
Write-Host "Set to: $new"
