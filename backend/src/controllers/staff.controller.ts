import { Request, Response } from 'express';
import { z } from 'zod';
import { getStaffUsers, getStaffUserById, createStaffUser, updateStaffUser, updateStaffStatus } from '../services/staff.service';
import { createAuditLog } from '../services/audit.service';
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
});

const staffUpdateSchema = staffCreateSchema.partial();

const staffStatusSchema = z.object({
  status: z.enum(['active', 'inactive', 'suspended']),
});

function currentUser(req: Request): UserPayload {
  const user = (req as Request & { user?: UserPayload }).user;
  if (!user) throw new BadRequestError('Unauthorized');
  return user;
}

function requireAdmin(req: AuthenticatedRequest): void {
  const user = req.user;
  if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
    throw new ForbiddenError('Only admins and managers can manage staff');
  }
}

export const listStaffUsers = async (req: Request, res: Response): Promise<void> => {
  const { page, limit } = getPagination(req.query as Record<string, unknown>);
  const q = req.query as Record<string, unknown>;
  const result = await getStaffUsers({ page, limit, search: getOptionalString(q.search), role: getOptionalString(q.role), status: getOptionalString(q.status) });
  res.json({ success: true, data: result.data, meta: result.meta });
};

export const getStaffUser = async (req: Request, res: Response): Promise<void> => {
  const staffUser = await getStaffUserById(req.params.id as string);
  res.json({ success: true, data: staffUser });
};

export const createNewStaffUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  requireAdmin(req);
  const validated = staffCreateSchema.parse(req.body);
  const created = await createStaffUser(validated);
  await createAuditLog('staff_user', 'staff.created', req.user?.id || null, 'staff', `Staff user '${created.email}' created`);
  res.json({ success: true, data: created });
};

export const updateExistingStaffUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  requireAdmin(req);
  const validated = staffUpdateSchema.parse(req.body);
  const updated = await updateStaffUser(req.params.id as string, validated);
  await createAuditLog('staff_user', 'staff.updated', req.user?.id || null, 'staff', `Staff user '${updated.email}' updated`);
  res.json({ success: true, data: updated });
};

export const updateStaffUserStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  requireAdmin(req);
  const validated = staffStatusSchema.parse(req.body);
  if (req.user?.id === req.params.id) {
    throw new ForbiddenError('You cannot change your own status');
  }
  const updated = await updateStaffStatus(req.params.id as string, validated.status);
  await createAuditLog('staff_user', 'staff.status_changed', req.user?.id || null, 'staff', `Staff user '${updated.email}' set to ${validated.status}`);
  res.json({ success: true, data: updated });
};
