$wf = (Get-Content 'C:\Projects\whatsapp-sales-assistant\workflows\01 - Incoming WhatsApp Message.json' -Raw | ConvertFrom-Json)[0]
foreach ($name in @('Upsert Contact','Insert Message','Update Conversation')) {
  $n = $wf.nodes | Where-Object { $_.name -eq $name }
  Write-Host ("===== {0} =====" -f $name)
  $n.parameters | ConvertTo-Json -Depth 12 | Out-Host
}
