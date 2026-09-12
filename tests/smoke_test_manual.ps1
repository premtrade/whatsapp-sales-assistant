# Manual smoke-test snippets for the WhatsApp Sales Assistant.
#
# Usage:
#   1) Make sure docker compose is up:  docker compose up -d
#   2) Make sure all 7 workflows are imported and ACTIVE in n8n.
#   3) Run any block below in PowerShell.
#
# Each block: a curl that hits the n8n webhook, then a psql assertion.

$N8N = "http://localhost:5678"
$PG  = "docker compose exec -T postgres psql -U postgres -d whatsapp_sales -A -t"

# -----------------------------------------------------------------------------
# 1. TEXT MESSAGE: Leroy, Kingston, JMD 200,000
# -----------------------------------------------------------------------------

$phone = "+1876" + ([guid]::NewGuid().ToString("N").Substring(0,8))
$msgId = "wamid." + ([guid]::NewGuid().ToString("N").Substring(0,12))

$payload = @{
  event = "message"
  session = "default"
  payload = @{
    id = $msgId
    timestamp = [int][double]::Parse((Get-Date -UFormat %s))
    from = ($phone -replace '\+','') + "@c.us"
    fromMe = $false
    body = "My name is Leroy. I need a general construction consultation for my house in Kingston. My budget is JMD 200,000."
    hasMedia = $false
    media = $null
    _data = @{ id = @{ _serialized = $msgId }; t = [int][double]::Parse((Get-Date -UFormat %s)) }
    pushName = "Leroy"
  }
} | ConvertTo-Json -Depth 6 -Compress

Invoke-RestMethod -Uri "$N8N/webhook/waha/messages" -Method POST -ContentType "application/json" -Body $payload
Start-Sleep -Seconds 3

# Workflow 01 stores phone WITHOUT the leading '+' — strip it for SQL lookups.
$phoneDb = $phone.TrimStart('+')
$phone2Db = $phone2.TrimStart('+')
$phone3Db = $phone3.TrimStart('+')
$phone4Db = $phone4.TrimStart('+')

# Assertions:
& $PG -c "SELECT contact_id FROM contacts WHERE phone = '$phoneDb';"
& $PG -c "SELECT fact_value FROM customer_facts WHERE contact_id = (SELECT id FROM contacts WHERE phone='$phoneDb') AND fact_key='customer_name';"
& $PG -c "SELECT fact_value FROM customer_facts WHERE contact_id = (SELECT id FROM contacts WHERE phone='$phoneDb') AND fact_key='budget';"
& $PG -c "SELECT fact_value FROM customer_facts WHERE contact_id = (SELECT id FROM contacts WHERE phone='$phoneDb') AND fact_key='location';"
& $PG -c "SELECT COUNT(*) FROM messages WHERE conversation_id = (SELECT id FROM conversations WHERE contact_id = (SELECT id FROM contacts WHERE phone='$phoneDb') AND channel='whatsapp') AND direction='outgoing' AND sender_type='ai';"

# Expected:
#   contact_id  -> non-empty UUID
#   customer_name -> 'Leroy'
#   budget       -> 'JMD 200,000'  (NOT 'JMD 200')
#   location     -> contains 'Kingston'
#   ai messages  -> >= 1

# -----------------------------------------------------------------------------
# 2. HUMAN HANDOFF REQUEST
# -----------------------------------------------------------------------------

$phone2 = "+1876" + ([guid]::NewGuid().ToString("N").Substring(0,8))
$msgId2 = "wamid." + ([guid]::NewGuid().ToString("N").Substring(0,12))

$payload2 = @{
  event = "message"; session = "default"
  payload = @{
    id = $msgId2
    timestamp = [int][double]::Parse((Get-Date -UFormat %s))
    from = ($phone2 -replace '\+','') + "@c.us"; fromMe = $false
    body = "Please let me speak to a real person."
    hasMedia = $false
    _data = @{ id = @{ _serialized = $msgId2 }; t = [int][double]::Parse((Get-Date -UFormat %s)) }
    pushName = "Anika"
  }
} | ConvertTo-Json -Depth 6 -Compress

Invoke-RestMethod -Uri "$N8N/webhook/waha/messages" -Method POST -ContentType "application/json" -Body $payload2
Start-Sleep -Seconds 3

& $PG -c "SELECT status FROM conversations WHERE contact_id = (SELECT id FROM contacts WHERE phone='$phone2Db') AND channel='whatsapp';"
& $PG -c "SELECT reason, status FROM handoffs WHERE conversation_id = (SELECT id FROM conversations WHERE contact_id = (SELECT id FROM contacts WHERE phone='$phone2Db') AND channel='whatsapp') ORDER BY created_at DESC LIMIT 1;"

# Expected:
#   conversations.status -> 'waiting_agent'  (NOT 'human_pending')
#   handoffs.reason      -> non-empty string
#   handoffs.status      -> 'pending'

# -----------------------------------------------------------------------------
# 3. QUOTE REQUEST (Garco-001 has price=NULL, so requires_review=true expected)
# -----------------------------------------------------------------------------

$phone3 = "+1876" + ([guid]::NewGuid().ToString("N").Substring(0,8))
$msgId3 = "wamid." + ([guid]::NewGuid().ToString("N").Substring(0,12))

$payload3 = @{
  event = "message"; session = "default"
  payload = @{
    id = $msgId3
    timestamp = [int][double]::Parse((Get-Date -UFormat %s))
    from = ($phone3 -replace '\+','') + "@c.us"; fromMe = $false
    body = "Can I get a quote for General Construction Consultation?"
    hasMedia = $false
    _data = @{ id = @{ _serialized = $msgId3 }; t = [int][double]::Parse((Get-Date -UFormat %s)) }
    pushName = "Marcus"
  }
} | ConvertTo-Json -Depth 6 -Compress

Invoke-RestMethod -Uri "$N8N/webhook/waha/messages" -Method POST -ContentType "application/json" -Body $payload3
Start-Sleep -Seconds 3

& $PG -c "SELECT quote_number, status, subtotal, total FROM quotes WHERE conversation_id = (SELECT id FROM conversations WHERE contact_id = (SELECT id FROM contacts WHERE phone='$phone3Db') AND channel='whatsapp') ORDER BY created_at DESC LIMIT 1;"
& $PG -c "SELECT metadata->>'requires_review' FROM quotes WHERE conversation_id = (SELECT id FROM conversations WHERE contact_id = (SELECT id FROM contacts WHERE phone='$phone3Db') AND channel='whatsapp') ORDER BY created_at DESC LIMIT 1;"

# Expected:
#   status         -> 'draft'  (NOT 'pending_review')
#   metadata.requires_review -> 'true' (because GARCO-001 price is NULL)

# -----------------------------------------------------------------------------
# 4. IMAGE MESSAGE (media persistence)
# -----------------------------------------------------------------------------

$phone4 = "+1876" + ([guid]::NewGuid().ToString("N").Substring(0,8))
$msgId4 = "wamid." + ([guid]::NewGuid().ToString("N").Substring(0,12))

$payload4 = @{
  event = "message"; session = "default"
  payload = @{
    id = $msgId4
    timestamp = [int][double]::Parse((Get-Date -UFormat %s))
    from = ($phone4 -replace '\+','') + "@c.us"; fromMe = $false
    body = ""
    hasMedia = $true
    media = @{ url = "https://example.invalid/fake.jpg"; mimetype = "image/jpeg"; filename = "site.jpg" }
    _data = @{ id = @{ _serialized = $msgId4 }; t = [int][double]::Parse((Get-Date -UFormat %s)) }
    pushName = "Sam"
  }
} | ConvertTo-Json -Depth 6 -Compress

Invoke-RestMethod -Uri "$N8N/webhook/waha/messages" -Method POST -ContentType "application/json" -Body $payload4
Start-Sleep -Seconds 2

& $PG -c "SELECT message_type, media_url, mime_type FROM messages WHERE whatsapp_message_id='$msgId4';"

# Expected:
#   message_type -> 'image'
#   media_url    -> contains 'example.invalid'
#   mime_type    -> 'image/jpeg'

# -----------------------------------------------------------------------------
# 5. FULL DB VALIDATION (no workflow exercise needed)
# -----------------------------------------------------------------------------

docker compose exec -T postgres psql -U postgres -d whatsapp_sales -X -f tests/validate_workflows.sql

# -----------------------------------------------------------------------------
# 6. WAHA HEALTH (check the API key indirection)
# -----------------------------------------------------------------------------

docker compose exec -T postgres psql -U postgres -d whatsapp_sales -c "SELECT COUNT(*) FROM messages WHERE direction='outgoing' AND sender_type='ai' AND created_at > NOW() - INTERVAL '5 minutes';"

# Then look at n8n execution logs in the UI to confirm WAHA Send Message ran without
# "401 Unauthorized" errors (would mean $env.WAHA_API_KEY wasn't set).