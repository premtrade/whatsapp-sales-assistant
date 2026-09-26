import { Request, Response } from 'express';
import { z } from 'zod';
import { getStaffUsers, getStaffUserById, createStaffUser, updateStaffUser, updateStaffStatus, deleteStaffUser as deleteStaffUserService } from '../services/staff.service';
import { createAuditLog } from '../services/audit.service';
import { requireStaffSeat } from '../services/subscription.service';
import { getPagination, getOptionalString } from '../utils/helpers';
import { UserPayload, AuthenticatedRequest } from '../types';
import { BadRequestError, ForbiddenError } from '../utils/errors';

const staffCreateSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  role: z.enum(['admin', 'manager', 'sales', 'support', 'technician']).optional(),
  timezone: z.string().optional(),
  password: z.string().min(6).optional(),
  status: z.enum(['active', 'inactive', 'suspended', 'invited']).optional(),
});

const staffUpdateSchema = staffCreateSchema.partial();

const staffStatusSchema = z.object({
  status: z.enum(['active', 'inactive', 'suspended', 'invited']),
});

function currentUser(req: Request): any {
  const user = (req as Request & { user?: any }).user;
  if (!user) throw new BadRequestError('Unauthorized');
  return user;
}

function requireAdmin(req: AuthenticatedRequest): void {
  const user = req.user;
  if (!user || (user.role !== 'admin' && user.role !== 'manager' && user.role !== 'super_admin')) {
    throw new ForbiddenError('Only admins and managers can manage staff');
  }
}

function getTenantId(req: AuthenticatedRequest): string {
  const tenantId = req.user?.businessId || req.user?.tenantId;
  if (!tenantId) throw new ForbiddenError('Tenant scope required');
  return tenantId;
}

export const listStaffUsers = async (req: Request, res: Response): Promise<void> => {
  const { page, limit } = getPagination(req.query as Record<string, unknown>);
  const q = req.query as Record<string, unknown>;
  const tenantId = getTenantId(req as AuthenticatedRequest);
  const result = await getStaffUsers({ page, limit, search: getOptionalString(q.search), role: getOptionalString(q.role), status: getOptionalString(q.status), tenantId });
  res.json({ success: true, data: result.data, meta: result.meta });
};

export const getStaffUser = async (req: Request, res: Response): Promise<void> => {
  const tenantId = getTenantId(req as AuthenticatedRequest);
  const staffUser = await getStaffUserById(req.params.id as string, tenantId);
  res.json({ success: true, data: staffUser });
};

export const createNewStaffUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const tenantId = getTenantId(req);
  await requireStaffSeat(tenantId);
  const validated = staffCreateSchema.parse(req.body);
  const created = await createStaffUser(validated, tenantId);
  await createAuditLog('staff_user', 'staff.created', req.user?.id || null, 'staff', `Staff user '${created.email}' created`, undefined, { email: created.email }, { staffId: created.id }, req.ip!, req.get('user-agent')!, tenantId);
  res.json({ success: true, data: created });
};

export const updateExistingStaffUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const tenantId = getTenantId(req);
  const validated = staffUpdateSchema.parse(req.body);
  const updated = await updateStaffUser(req.params.id as string, validated, tenantId);
  await createAuditLog('staff_user', 'staff.updated', req.user?.id || null, 'staff', `Staff user '${updated.email}' updated`, undefined, { email: updated.email }, { staffId: updated.id }, req.ip!, req.get('user-agent')!, tenantId);
  res.json({ success: true, data: updated });
};

export const updateStaffUserStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const tenantId = getTenantId(req);
  const validated = staffStatusSchema.parse(req.body);
  if (req.user?.id === req.params.id) {
    throw new ForbiddenError('You cannot change your own status');
  }
  const updated = await updateStaffStatus(req.params.id as string, validated.status, tenantId);
  await createAuditLog('staff_user', 'staff.status_changed', req.user?.id || null, 'staff', `Staff user '${updated.email}' set to ${validated.status}`, undefined, { status: validated.status }, { staffId: updated.id }, req.ip!, req.get('user-agent')!, tenantId);
  res.json({ success: true, data: updated });
};

export const deleteStaffUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const tenantId = getTenantId(req);
  // Prevent deleting yourself
  if (req.user?.id === req.params.id) {
    throw new ForbiddenError('You cannot delete your own account');
  }
  // Get the staff user before deletion for audit log
  const staffUser = await getStaffUserById(req.params.id as string, tenantId);
  await deleteStaffUserService(req.params.id as string, tenantId);
  await createAuditLog('staff_user', 'staff.deleted', req.user?.id || null, 'staff', `Staff user '${staffUser.email}' deleted`, undefined, { email: staffUser.email }, { staffId: staffUser.id }, req.ip!, req.get('user-agent')!, tenantId);
  res.json({ success: true, message: 'Staff user deleted' });
};
