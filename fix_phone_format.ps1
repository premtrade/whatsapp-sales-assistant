$path = 'C:\Projects\whatsapp-sales-assistant\workflows\03 - Memory & Context Builder.json'
$workflow = Get-Content $path -Raw | ConvertFrom-Json
$businessNode = $workflow.nodes | Where-Object { $_.name -eq 'Get Business by Phone' }

if (-not $businessNode) {
    throw 'Get Business by Phone node was not found.'
}

if ($businessNode.parameters.query -notmatch 'id = \$1::uuid') {
    throw 'Workflow 3 is not using the propagated business_id lookup; refusing to overwrite it.'
}

Write-Output 'Workflow 3 already resolves the tenant by propagated business_id; no changes made.'
