# WhatsApp Sales Assistant — New Business Onboarding Guide

## Overview

This guide walks you through setting up a new business on the WhatsApp Sales Assistant platform. The onboarding process has four main phases:

1. **General Setup** — business profile, authentication, domain
2. **WhatsApp Configuration** — connecting your WhatsApp number
3. **Staff Setup** — creating team members and roles
4. **System Settings** — knowledge base, automation, preferences

Estimated time: 30–45 minutes

---

## Prerequisites

- Business dashboard URL (e.g. `https://waflo.vercel.app`)
- Admin login email and temporary password
- WhatsApp business number (must be able to receive SMS or voice call for verification)
- Business information: name, industry, operating hours, services offered

---

## Phase 1: General Setup

### 1.1 First Login

1. Open your dashboard URL in a browser
2. Enter the admin email and temporary password provided by your system administrator
3. You will be prompted to create a new password — choose a strong password and save it securely
4. Complete any multi-factor authentication setup if required

### 1.2 Business Profile

Navigate to **Settings → General** and fill in your business details:

| Field | Description | Required |
|---|---|---|
| Business Name | Your company or brand name | Yes |
| Slug | URL-friendly identifier (lowercase, hyphens only) | Yes |
| Industry | Choose the closest match | Yes |
| Phone | Primary business phone number | Yes |
| Email | Public contact email | Yes |
| Address | Physical business address | No |
| Website | Business website URL | No |
| Operating Hours | Days and hours you’re available | Yes |
| Timezone | Your local timezone | Yes |
| Currency | Default currency for quotes | Yes |

**Slug rules:**
- Only lowercase letters, numbers, and hyphens
- No spaces or special characters
- Example: `acme-plumbing`, `bright-electric`

### 1.3 Brand Configuration

In the same **Settings → General** page:

- **Logo**: Upload your business logo (recommended: 512x512px PNG)
- **Primary Color**: Choose your brand color for the dashboard
- **Email Signature**: Set the signature for automated emails (optional)

### 1.4 Notification Preferences

Configure when and how you receive notifications:

- **New Lead Alerts**: Notify when a new customer starts a conversation
- **Handoff Alerts**: Notify when the AI escalates a conversation to human
 - **Quote Alerts**: Notify when a quote is accepted or rejected
- **Appointment Reminders**: Notify before scheduled appointments
- **Daily Summary**: Email digest of the previous day’s activity

---

## Phase 2: WhatsApp Configuration

### 2.1 Connecting Your Number

The WhatsApp integration uses **WAHA** (WhatsApp HTTP API) to connect your number to the platform. Your number must be able to receive a verification code.

1. In the dashboard, go to **Settings → WhatsApp**
2. Click **Connect WhatsApp Number**
3. Enter your WhatsApp business number in international format:
   - Example: `+251912345678`
   - Do not include leading zeros
4. Click **Send Verification Code**
5. Enter the code you received via SMS or voice call
6. Your number is now connected

### 2.2 QR Code Scanning

In some deployments, you may need to scan a QR code with your phone:

1. An SSH tunnel is required to access the WAHA dashboard on the server
2. Run this command from your computer:
   ```bash
   ssh -L 3001:127.0.0.1:3001 root@YOUR_SERVER_IP
   ```
3. Open `http://localhost:3001` in your browser
4. In WAHA, go to **Sessions** → your session
5. Click **Show QR Code**
6. Open WhatsApp on your phone → **Linked Devices** → **Link a Device**
7. Scan the QR code
8. Your number is now connected and ready to send/receive messages

### 2.3 Verifying Connection

1. In the dashboard, go to **Settings → WhatsApp**
2. You should see:
   - **Status**: Connected
   - **Number**: your connected number
   - **Session**: Active
3. Send a test message from your phone to your WhatsApp business number
4. The message should appear in the **Inbox** within seconds

### 2.4 Webhook Configuration

The platform automatically configures webhooks to deliver messages to the AI engine. No action is required unless you are on a custom deployment.

If messages are not being received:

1. Verify the WAHA session is active:
   ```bash
   ssh -L 3001:127.0.0.1:3001 root@YOUR_SERVER_IP
   curl http://localhost:3001/api/sessions
   ```
2. Verify the n8n webhook is registered:
   ```bash
   ssh -L 5678:127.0.0.1:5678 root@YOUR_SERVER_IP
   # Open http://localhost:5678 and check workflow "01 - Incoming WhatsApp Message" is active
   ```

---

## Phase 3: Staff Setup

### 3.1 Understanding Roles

The platform has three built-in roles:

| Role | Access Level | Use Case |
|---|---|---|
| **Admin** | Full access to all settings, staff, and system configuration | Business owner, IT administrator |
| **Manager** | Can manage conversations, leads, appointments, and knowledge base | Sales manager, team lead |
| **Agent** | Can manage conversations and update customer information | Sales representative, support agent |

### 3.2 Creating Staff Accounts

1. In the dashboard, go to **Settings → Staff**
2. Click **Add Team Member**
3. Fill in the details:

| Field | Description |
|---|---|
| First Name | Given name |
| Last Name | Family name |
| Email | Work email (used for login) |
| Phone | Contact number |
| Role | Admin, Manager, or Agent |
| Status | Active or Inactive |
| Timezone | Staff member’s local timezone |
| Password | Temporary password (staff will be asked to change on first login) |

4. Click **Create Account**
5. Share the login email and temporary password with the staff member via a secure channel
6. Staff members should change their password immediately on first login

### 3.3 Managing Staff

- **Edit**: Click the staff member’s name to update details or change role
- **Deactivate**: Click the toggle to temporarily disable access without deleting the account
- **Delete**: Permanent removal (requires confirmation)

### 3.4 Permissions Reference

| Feature | Admin | Manager | Agent |
|---|---|---|---|
| Dashboard | Yes | Yes | Yes |
| Inbox (conversations) | Yes | Yes | Yes |
| Customers | Yes | Yes | Yes |
| Leads / Pipeline | Yes | Yes | Yes |
| Quotes | Yes | Yes | No |
| Appointments | Yes | Yes | Yes |
| Handoffs | Yes | Yes | Yes |
| Knowledge Base | Yes | Yes | No |
| Settings → General | Yes | No | No |
| Settings → Staff | Yes | No | No |
| Settings → System | Yes | No | No |

---

## Phase 4: System Settings

### 4.1 Knowledge Base

The AI uses your knowledge base to answer customer questions. A well-maintained knowledge base is essential for accurate AI responses.

1. In the dashboard, go to **Settings → Knowledge Base**
2. Click **Upload Document**
3. Supported formats:
   - PDF
   - Word (.docx)
   - Excel (.xlsx, .xls)
   - Text (.txt)
   - Markdown (.md)
4. Enter a **Title** and **Description** for the document
5. Select a **Category** (e.g. Products, Pricing, Services, FAQ)
6. Click **Upload**

**Best practices:**
- Upload product catalogs, price lists, and service descriptions
- Keep documents under 50 pages each
- Use clear headings and bullet points
- Update documents regularly as offerings change
- Name files descriptively: `2024-product-catalog.pdf` not `catalog.pdf`

### 4.2 AI Behavior

1. Go to **Settings → General** (Admin only)
2. Configure:

| Setting | Description |
|---|---|
| AI Greeting | First message the AI sends to new customers |
| AI Personality | Tone: Professional, Friendly, Casual |
| Handoff Triggers | Keywords/phrases that trigger human handoff |
| Business Hours | When the AI should operate vs. hand off |
| Auto-Reply Delay | Seconds to wait before AI responds |
| Lead Qualification | Criteria for lead scoring |

**Handoff triggers examples:**
- "I want to speak to a person"
- "Can I get a human?"
- "I have a complaint"
- "This is urgent"

### 4.3 Message Templates

1. Go to **Settings → General** → **Message Templates**
2. Common templates to create:

| Template | When Used |
|---|---|
| Welcome Message | Sent when a customer first messages |
| Away Message | Sent outside business hours |
| Quote Follow-up | Sent after sending a quote |
| Appointment Reminder | Sent 24 hours before appointment |
| Thank You | Sent after a completed purchase |

### 4.4 Integration Settings

1. Go to **Settings → Integrations**
2. Configure:

| Integration | Description |
|---|---|
| Calendar Sync | Sync appointments with Google Calendar or Outlook |
| CRM Export | Auto-export leads to external CRM |
| Email Notifications | Which events trigger email alerts |
| Webhook URL | Custom endpoint for event notifications |

### 4.5 Security Settings

1. Go to **Settings → Security** (Admin only)
2. Configure:

| Setting | Description |
|---|---|
| Password Policy | Minimum length, complexity requirements |
| Session Timeout | Minutes of inactivity before auto-logout |
| Two-Factor Auth | Require 2FA for all staff |
| IP Whitelist | Restrict dashboard access to specific IPs |
| Audit Log Retention | Days to keep audit logs |

---

## Phase 5: Testing and Validation

### 5.1 End-to-End Test

After completing onboarding, run this test:

1. **Staff Login**: Each staff member logs in with their credentials
2. **Incoming Message**: Send a WhatsApp message from an external number
3. **AI Response**: Verify the AI responds appropriately
4. **Handoff Test**: Send a handoff trigger phrase and verify it appears in the Handoffs page
5. **Dashboard Data**: Confirm the Dashboard shows real conversations, leads, and metrics
6. **Lead Creation**: Verify the conversation appears in the Leads page
7. **Customer Profile**: Verify the contact is created with correct details

### 5.2 Verification Checklist

- [ ] Business profile is complete in Settings → General
- [ ] WhatsApp number is connected and receiving messages
- [ ] All staff accounts are created and staff can log in
- [ ] Knowledge base has at least 3-5 relevant documents
- [ ] AI greeting message is configured
- [ ] Handoff triggers are set
- [ ] Dashboard shows live data
- [ ] Test message received AI response within 30 seconds
- [ ] Test handoff appeared in Handoffs page
- [ ] Test lead appeared in Leads page

---

## Common Issues and Solutions

### WhatsApp Not Connecting

**Symptom**: Messages not being received or sent

**Solution**:
1. Verify the WAHA session is active on the server
2. Check the phone has an active internet connection
3. Restart the WAHA container: `docker compose restart waha`
4. Re-scan the QR code if the session expired

### AI Not Responding

**Symptom**: Messages are received but no AI response is sent

**Solution**:
1. Check the n8n workflow is active: `01 - Incoming WhatsApp Message`
2. Verify the Postgres credential in n8n points to the correct database
3. Check n8n logs for errors: `docker compose logs n8n --tail 50`
4. Verify knowledge base documents are indexed

### Staff Cannot Log In

**Symptom**: Invalid email or password error

**Solution**:
1. Verify the staff account is active in Settings → Staff
2. Reset the password from Settings → Staff → Edit
3. Clear browser cache and try again

### Dashboard Not Loading Data

**Symptom**: Dashboard shows empty or loading indefinitely

**Solution**:
1. Verify the backend health endpoint: `https://waflo.vercel.app/api/health`
2. Check backend logs for database connection errors
3. Verify staff account has a business/tenant assignment
4. Refresh the page and check browser console for errors

---

## Post-Onboarding

### Week 1

- Monitor the Inbox daily for any messages the AI doesn’t handle well
- Review Handoffs and provide feedback on AI responses
- Add 2-3 new knowledge documents based on common customer questions
- Invite remaining staff members

### Week 2-4

- Adjust AI behavior based on conversation quality
- Create 5-10 message templates for common scenarios
- Set up automated appointment reminders
- Review Analytics weekly to identify trends

### Ongoing

- Add new knowledge documents as products/services change
- Review handoff triggers monthly
- Audit staff accounts quarterly
- Backup knowledge base and settings monthly

---

## Support

For technical assistance:
- **Platform Administrator**: Contact your system administrator
- **Infrastructure Issues**: `docs/runbook.md`
- **Deployment Issues**: `docs/DEPLOYMENT.md`
- **Integration Issues**: `docs/INTEGRATION_GUIDE.md`
