$wf = (Get-Content 'C:\Projects\whatsapp-sales-assistant\workflows\01 - Incoming WhatsApp Message.json' -Raw | ConvertFrom-Json)[0]
foreach ($n in $wf.nodes) {
  Write-Host ("=== {0} ({1}) ===" -f $n.name, $n.type)
  $p = $n.parameters | ConvertTo-Json -Depth 10 -Compress
  Write-Host $p
}
