$ErrorActionPreference = 'Stop'
$guid = { return [guid]::NewGuid().ToString() }

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
            query = "SELECT EXISTS(`n    SELECT 1 FROM businesses b`n    WHERE regexp_replace(b.whatsapp_phone, '[^0-9]', '', 'g') = regexp_replace(`$1, '[^0-9]', '', 'g')`n      AND b.deleted_at IS NULL`n) AS is_own_number;"
            options = [pscustomobject]@{}
            queryReplacement = '={{ $json.phone }}'
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
                    leftValue = '={{ $json.is_own_number }}'
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

