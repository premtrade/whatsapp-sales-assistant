$names = @('01 - Incoming WhatsApp Message.json','03 - Memory & Context Builder.json','04 - Memory Writer.json','Workflow 2 - AI Brain.json')
foreach ($n in $names) {
  docker cp "workflows/$n" n8n:/tmp/repl.json
  docker exec n8n n8n import:workflow --input=/tmp/repl.json 2>&1 | Select-Object -Last 1
  Write-Host "imported $n"
}
