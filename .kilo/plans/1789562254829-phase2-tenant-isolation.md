# Phase 2: Tenant Isolation - Implementation Plan

## Overview
Close all Phase 2 tenant isolation gaps identified in the audit. Focus on complete tenant scoping across data models, routes, services, JWT claims, and administrative actions.

---

## 1. Database Migrations

### 1.1 New Migration: Add business_id to Missing Tables
**File**: `database/migrations/051_add_missing_business_id.sql`

Tables needing `business_id`:
- `messages` - Add via FK to conversations (business_id derived)
- `quote_items` - Add via FK to quotes (business_id derived)
- `knowledge_chunks` - Add via FK to knowledge_documents (business_id derived)
- `customer_facts` - Add via FK to contacts (business_id derived)
- `conversation_summaries` - Add via FK to conversations (business_id derived)
- `memory_embeddings` - Add via FK to contacts/conversations (business_id derived)
- `lead_scores` - Add business_id column
- `conversation_notes` - Add business_id column
- `quick_replies` - Already in 050
- `follow_up_queue` - Already in 050
- `waha_retry_queue` - Already in 050
- `audit_logs` - Already in 050

For derived tables, business_id can be populated via triggers or application logic.

### 1.2 Fix Migration 050 Mounting
**File**: `docker-compose.yml`
- Add 050_tenant_hardening.sql to postgres initdb volumes
- Add 049_conversations_unique_contact_channel.sql

### 1.3 Fix apply-migrations.ps1
- Add migration tracker table
- Make script idempotent with version tracking

---

## 2. Settings Service - Remove Global Fallback

### 2.1 Settings Service (`backend/src/services/settings.service.ts`)
- Remove `business_id IS NULL` fallback in `getSettings`, `getSettingByKey`, `updateSetting`
- All queries must require explicit `tenantId`
- `createSetting` should require `tenantId` (not optional)

### 2.2 Settings Controller
- Ensure all calls pass `tenantId` from authenticated user

---

## 3. Staff Service - Tenant Scoping

### 3.1 Staff Service (`backend/src/services/staff.service.ts`)
- Add `tenantId` parameter to all methods
- `getStaffUsers` - filter by `business_id = $tenantId`
- `getStaffUserById` - verify tenant ownership
- `createStaffUser` - set `business_id = $tenantId`
- `updateStaffUser` - verify tenant ownership
- `updateStaffStatus` - verify tenant ownership
- Add composite unique index: `(business_id, email)`

### 3.2 Staff Controller
- Pass `tenantId` from authenticated user to all service calls

---

## 4. Services - Complete Tenant Scoping

### 4.1 Handoff Service (Already done in Phase 1)
- ✅ All queries include tenantId

### 4.2 Dashboard Service (`backend/src/services/dashboard.service.ts`)
- Add `tenantId` parameter to `getDashboardStats`
- All aggregate queries must filter by `business_id = $tenantId`

### 4.2 Lead Score Service (`backend/src/services/leadScore.service.ts`)
- Add `tenantId` to `LeadScoreFilters` interface
- All queries filter by `business_id = $tenantId`
- `getLeadPipelineSummary` requires tenantId

### 4.3 Follow-up Service (`backend/src/services/followUp.service.ts`)
- Add `tenantId` parameter to all methods
- Filter by `business_id = $tenantId`

### 4.4 Quick Replies Service (`backend/src/services/quickReply.service.ts`)
- Add `tenantId` parameter to all methods
- Filter by `business_id = $tenantId`

### 4.5 Conversation Notes Service (`backend/src/services/conversationNote.service.ts`)
- Add `tenantId` parameter to all methods
- Verify conversation belongs to tenant before operations

### 4.6 Business Service (`backend/src/services/business.service.ts`)
- **Remove or restrict** - Super-admin only for cross-tenant operations
- Regular users should only see their own business
- Add `requireRole('super_admin')` for list/create/update/delete

### 4.7 Message Service (Already has tenantId from conversation)

---

## 5. Controllers - Pass tenantId to Services & Audit

### 5.1 All Controllers
- Extract `tenantId` from `req.user.businessId || req.user.tenantId`
- Pass `tenantId` to all service calls
- Pass `tenantId` to `createAuditLog` calls

### 5.2 Specific Controllers to Update
- `handoff.controller.ts` ✅ (done in Phase 1)
- `message.controller.ts`
- `conversation.controller.ts`
- `quote.controller.ts`
- `appointment.controller.ts`
- `contact.controller.ts`
- `knowledge.controller.ts`
- `staff.controller.ts`
- `settings.controller.ts`
- `leadScore.controller.ts`
- `followUp.controller.ts`
- `quickReply.controller.ts`
- `conversationNote.controller.ts`
- `business.controller.ts`
- `dashboard.controller.ts`

---

## 6. Audit Logging Fixes

### 6.1 `createAuditLog` (`backend/src/services/audit.service.ts`)
- **Don't swallow errors** - throw or log properly
- Require `businessId` parameter (not optional)
- Add validation

### 6.2 All Controllers
- Pass `tenantId` to `createAuditLog` as `businessId` parameter
- Include relevant metadata

---

## 7. Types - Add businessId to Filters

### 7.1 `backend/src/types/index.ts`
- Add `businessId?: string; tenantId?: string;` to:
  - `StaffFilters`
  - `LeadScoreFilters`
  - `FollowUpFilters` (if exists)
  - `QuickReplyFilters` (if exists)
  - `ConversationNoteFilters` (if exists)

---

## 8. Business Service - Restrict to Super-Admin

### 8.1 Business Controller
- Add `requireRole('super_admin')` middleware to all routes
- Or create separate super-admin routes

### 8.2 Business Routes
- Mount under `/api/admin/businesses` for super-admin only
- Keep `/api/businesses` for current tenant's business only (GET own)

---

## 9. Duplicate Staff Route Mount

### 9.1 `backend/src/app.ts`
- Remove duplicate: `app.use('/api/staff/users', staffRoutes);`
- Keep only `app.use('/api/staff', staffRoutes);`

---

## 10. Docker Compose & Migration Tracker

### 10.1 `docker-compose.yml`
- Add missing migrations to postgres initdb volumes:
  - `./database/migrations/049_conversations_unique_contact_channel.sql`
  - `./database/migrations/050_tenant_hardening.sql`
  - `./database/migrations/051_add_missing_business_id.sql` (new)

### 10.2 `apply-migrations.ps1`
- Add migration tracking table
- Track applied migrations by filename
- Skip already-applied migrations

---

## 11. Validation & Testing

### 11.1 Unit Tests
- `tenant_isolation.test.ts` - Verify all queries scoped to tenant
- `audit_logging.test.ts` - Verify audit logs created with business_id

### 11.2 Integration Tests
- Multi-tenant data isolation verification
- Cross-tenant access attempts rejected

---

## 12. Rollout Order

1. **Migrations first** - 051, fix 050 mounting, fix apply-migrations
2. **Core services** - settings, staff, handoff
3. **Other services** - dashboard, leadScore, followUp, quickReply, conversationNote
4. **Controllers & audit** - pass tenantId everywhere
5. **Business service restriction** - super-admin only
6. **Remove duplicate route**
7. **Docker & migration fixes**
7. **Tests**

---

## Risk Summary

| Risk | Mitigation |
|------|------------|
| Breaking existing single-tenant deployments | Migrations are additive; seed default tenant |
| Performance impact of tenant filters | Add proper indexes (already in migrations) |
| Audit log errors breaking requests | Log errors but don't throw in createAuditLog |
| Cross-tenant data leaks | Comprehensive test coverage |
| Staff email uniqueness | Composite unique index (business_id, email) |

---

## Validation Commands

```bash
cd backend && npm run build
cd backend && npm test
# Manual: verify multi-tenant isolation with two tenants
```