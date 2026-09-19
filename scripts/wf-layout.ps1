$ErrorActionPreference = 'Stop'
$path = 'C:\Projects\whatsapp-sales-assistant\workflows\01 - Incoming WhatsApp Message.json'
$wf = (Get-Content $path -Raw | ConvertFrom-Json)[0]

# Clean left-to-right layout: main spine on y=300, success branch above, all
# dead-end/terminal branches converge on Respond to Webhook at bottom right.
$layout = @{
  'Webhook'                        = ,@(-1180, 300)
  'Normalize Payload'              = ,@(-960, 300)
  'Sanitize Inputs'                = ,@(-740, 300)
  'Status Filter'                  = ,@(-520, 300)
  'Supported Event?'               = ,@(-300, 300)
  'Incoming Message?'              = ,@(-80, 300)
  'Own Number Check'               = ,@(140, 300)
  'From Our Number?'               = ,@(360, 300)
  'Upsert Contact'                 = ,@(580, 180)
  'Upsert Conversation'            = ,@(800, 180)
  'Insert Message'                 = ,@(1020, 180)
  'Fresh Message?'                 = ,@(1240, 180)
  'Update Conversation'            = ,@(1460, 80)
  'Insert Audit Log'               = ,@(1680, 80)
  "Call 'Workflow 2 - AI Brain'"   = ,@(1900, 80)
  'Respond to Webhook'             = ,@(1900, 400)
}

foreach ($n in $wf.nodes) {
  if ($layout.ContainsKey($n.name)) { $n.position = $layout[$n.name] }
  else { Write-Warning "No layout for node: $($n.name)" }
}
@($wf) | ConvertTo-Json -Depth 30 | Set-Content $path -Encoding UTF8
Write-Host "Layout applied to $($wf.nodes.Count) nodes"
