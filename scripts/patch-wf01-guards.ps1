$ErrorActionPreference = 'Stop'
$guid = { return [guid]::NewGuid().ToString() }

# Guard query: $1 = sender phone, $2 = alphanumeric fingerprint of message text
$guardQuery = @"
WITH target AS (
    SELECT cv.id AS conversation_id
    FROM contacts c
    JOIN conversations cv ON cv.contact_id = c.id AND cv.channel = 'whatsapp'
    WHERE c.phone = `$1
    ORDER BY cv.last_message_at DESC NULLS LAST
    LIMIT 1
),
echo AS (
    SELECT EXISTS(
        SELECT 1
        FROM messages m
        WHERE m.conversation_id = (SELECT conversation_id FROM target)
          AND m.direction = 'outgoing'
          AND m.created_at > NOW() - INTERVAL '15 minutes'
          AND length(`$2) > 0
          AND lower(regexp_replace(coalesce(m.text_body, ''), '[^a-zA-Z0-9]+', '', 'g')) = `$2
    ) AS is_echo
),
own AS (
    SELECT EXISTS(
        SELECT 1 FROM businesses b
        WHERE regexp_replace(b.whatsapp_phone, '[^0-9]', '', 'g') = regexp_replace(`$1, '[^0-9]', '', 'g')
          AND b.deleted_at IS NULL
    ) AS is_own_number
)
SELECT own.is_own_number, echo.is_echo, (own.is_own_number OR echo.is_echo) AS should_block
FROM own CROSS JOIN echo;
"@

function Patch-Workflow([string]$Path) {
    Write-Host "Patching $Path"
    $json = Get-Content $Path -Raw | ConvertFrom-Json
    if ($json -is [array]) { $wf = $json[0] } else { $wf = $json }

    $names = $wf.nodes | ForEach-Object { $_.name }
    foreach ($req in @('Webhook','Incoming Message?','Upsert Contact','Insert Message','Update Conversation','Respond to Webhook')) {
        if ($names -notcontains $req) { throw "Missing required node '$req' in $Path" }
    }

    $wf.nodes = @($wf.nodes | Where-Object { $_.name -notin @('Own Number Check','From Our Number?','Fresh Message?') })

    $pgCred = ($wf.nodes | Where-Object { $_.name -eq 'Upsert Contact' }).credentials.postgres

    $ownNumberNode = [pscustomobject]@{
        parameters = [pscustomobject]@{
            operation = 'executeQuery'
            query = $guardQuery
            options = [pscustomobject]@{
                # queryReplacement must live INSIDE options for the n8n Postgres node
                queryReplacement = "={{ `$json.phone }}, {{ (`$json.message || '').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase() }}"
            }
        }
        type = 'n8n-nodes-base.postgres'
        typeVersion = 2.7
        position = @(16, 224)
        id = & $guid
        name = 'Own Number Check'
        credentials = [pscustomobject]@{ postgres = $pgCred }
    }

    $fromOurNumberNode = [pscustomobject]@{
        parameters = [pscustomobject]@{
            conditions = [pscustomobject]@{
                options = [pscustomobject]@{ caseSensitive = $true; leftValue = ''; typeValidation = 'loose'; version = 3 }
                conditions = @([pscustomobject]@{
                    id = & $guid
                    leftValue = '={{ $json.should_block }}'
                    rightValue = $false
                    operator = [pscustomobject]@{ type = 'boolean'; operation = 'equals' }
                })
                combinator = 'and'
            }
            looseTypeValidation = $true
            options = [pscustomobject]@{}
        }
        type = 'n8n-nodes-base.if'
        typeVersion = 2.3
        position = @(224, 224)
        id = & $guid
        name = 'From Our Number?'
    }

    $freshMessageNode = [pscustomobject]@{
        parameters = [pscustomobject]@{
            conditions = [pscustomobject]@{
                options = [pscustomobject]@{ caseSensitive = $true; leftValue = ''; typeValidation = 'loose'; version = 3 }
                conditions = @([pscustomobject]@{
                    id = & $guid
                    leftValue = "={{ Boolean(`$('Insert Message').first().json.id) }}"
                    rightValue = $true
                    operator = [pscustomobject]@{ type = 'boolean'; operation = 'true'; singleValue = $true }
                })
                combinator = 'and'
            }
            looseTypeValidation = $true
            options = [pscustomobject]@{}
        }
        type = 'n8n-nodes-base.if'
        typeVersion = 2.3
        position = @(432, 48)
        id = & $guid
        name = 'Fresh Message?'
    }

    $wf.nodes = @($wf.nodes + $ownNumberNode + $fromOurNumberNode + $freshMessageNode)

    $c = $wf.connections
    $c.'Incoming Message?'.main[0] = @([pscustomobject]@{ node = 'Own Number Check'; type = 'main'; index = 0 })
    $c | Add-Member -NotePropertyName 'Own Number Check' -NotePropertyValue ([pscustomobject]@{ main = @(@([pscustomobject]@{ node = 'From Our Number?'; type = 'main'; index = 0 })) }) -Force
    $c | Add-Member -NotePropertyName 'From Our Number?' -NotePropertyValue ([pscustomobject]@{ main = @(
        @([pscustomobject]@{ node = 'Upsert Contact'; type = 'main'; index = 0 }),
        @([pscustomobject]@{ node = 'Respond to Webhook'; type = 'main'; index = 0 })
    ) }) -Force
    $c.'Insert Message'.main[0] = @([pscustomobject]@{ node = 'Fresh Message?'; type = 'main'; index = 0 })
    $c | Add-Member -NotePropertyName 'Fresh Message?' -NotePropertyValue ([pscustomobject]@{ main = @(
        @([pscustomobject]@{ node = 'Update Conversation'; type = 'main'; index = 0 }),
        @([pscustomobject]@{ node = 'Respond to Webhook'; type = 'main'; index = 0 })
    ) }) -Force

    $out = if ($json -is [array]) { @($wf) } else { $wf }
    $out | ConvertTo-Json -Depth 30 | Set-Content $Path -Encoding UTF8
    Write-Host "Patched OK: $($wf.nodes.Count) nodes"
}

Patch-Workflow $args[0]
