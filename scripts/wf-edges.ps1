$wf = (Get-Content 'C:\Projects\whatsapp-sales-assistant\workflows\01 - Incoming WhatsApp Message.json' -Raw | ConvertFrom-Json)[0]
foreach ($p in $wf.connections.PSObject.Properties) {
  $from = $p.Name
  $branches = $p.Value.main
  for ($b = 0; $b -lt $branches.Count; $b++) {
    foreach ($t in $branches[$b]) {
      $label = if ($branches.Count -gt 1) { if ($b -eq 0) {'true'} else {'false'} } else { '' }
      Write-Host ('{0} --[{1}]--> {2}' -f $from, $label, $t.node)
    }
  }
}
Write-Host '--- NODES ---'
$wf.nodes | ForEach-Object { Write-Host ('{0}  pos=({1},{2})' -f $_.name, $_.position[0], $_.position[1]) }
