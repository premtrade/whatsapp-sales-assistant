# Releasing the appointment and quote workflows

The workflow JSON files in this repository do not automatically update workflows already stored in n8n. Deploy the backend first, then update the n8n workflows explicitly.

## Required backend setting

Set `N8N_WEBHOOK_SECRET` to a long random value in the production environment used by the backend container, then recreate the backend container so it receives the setting. Keep this value private. The appointment booking, quote delivery, and quote acceptance endpoints reject requests without this secret and a fresh `X-Timestamp` header.

## Update n8n

1. Import the updated `workflows/01 - Incoming WhatsApp Message.json`, `workflows/03 - Memory & Context Builder.json`, `workflows/05 - Appointment Tool.json`, `workflows/06 - Quote Tool.json`, `workflows/08 - Quote Follow-up Sequences.json`, and `workflows/Workflow 2 - AI Brain.json` into n8n, or update those workflows in place.
2. In each of the three HTTP Request nodes, replace `REPLACE_WITH_N8N_WEBHOOK_SECRET` with the exact value configured as `N8N_WEBHOOK_SECRET` in the backend. The timestamp expression is generated for each request and should remain enabled.
3. Reconnect the Postgres credential on nodes that query Postgres. n8n exports can contain credential IDs from another instance; imported workflows may need the credential selected again.
4. Confirm the backend URL `http://backend:4000` resolves from the n8n container. If the containers use separate Docker networks, use the backend's reachable internal URL instead.
5. Save, publish or activate each updated workflow, and confirm the active version contains the updated nodes.
6. Make one controlled test quote and one appointment using a test contact and verify the tenant, status, PDF delivery, WhatsApp notifications, and audit records in the application.

The repository includes `scripts/import_workflows.py`, but it deletes existing n8n workflows with matching names before creating replacements. Do not run it against production without first changing that behavior or taking an n8n backup. Manual import/update avoids that destructive importer behavior.

## Trial reminder email settings

The backend sends trial reminder emails at approximately seven days and two days before `trial_ends_at`. Configure `SENDGRID_API_KEY`, a verified `SENDGRID_FROM_EMAIL`, and `SUPPORT_EMAIL` in the production backend environment. A business admin email is preferred; the business email is used when no active admin or manager email exists. Failed sends are retried by the hourly job. Each successfully sent reminder is recorded in subscription metadata to prevent duplicates.

## Current behavior

- Appointment booking resolves the requested local date and time using the business timezone, checks the customer and assigned staff calendars, writes the appointment and audit record, then sends customer and staff WhatsApp notifications.
- Quote creation stores tenant ownership on both the quote and quote item. The backend generates and sends the PDF through the business's WAHA session.
- An affirmative reply can accept the most recent valid sent quote in that conversation. The main incoming message workflow needs this updated version active for acceptance handling.
- The 48-hour quote reminder waits until the customer has had two days to review the PDF. It retries during the following day if delivery fails and stops after a customer reply or successful delivery.
