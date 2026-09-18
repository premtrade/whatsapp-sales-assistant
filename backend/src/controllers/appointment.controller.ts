import { Request, Response } from 'express';
import { z } from 'zod';
import { getAppointments, getAppointmentById, updateAppointmentStatus } from '../services/appointment.service';
import { BadRequestError } from '../utils/errors';
import { getPagination, getOptionalString } from '../utils/helpers';
import { createAuditLog } from '../services/audit.service';
import { UserPayload } from '../types';

const updateStatusSchema = z.object({
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']),
});

export const listAppointments = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, sortBy, sortOrder } = getPagination(req.query as Record<string, unknown>);
  const query = req.query as Record<string, unknown>;
  const tenantId = (req as Request & { user?: UserPayload }).user?.businessId || (req as Request & { user?: UserPayload }).user?.tenantId;

  const result = await getAppointments({
    page,
    limit,
    sortBy,
    sortOrder,
    businessId: tenantId,
    status: getOptionalString(query.status),
    contactId: getOptionalString(query.contactId),
    assignedTo: getOptionalString(query.assignedTo),
    startDate: getOptionalString(query.startDate),
    endDate: getOptionalString(query.endDate),
  });

  res.json({
    success: true,
    data: result.data,
    meta: result.meta,
  });
};

export const getAppointment = async (req: Request, res: Response): Promise<void> => {
  const tenantId = (req as Request & { user?: UserPayload }).user?.businessId || (req as Request & { user?: UserPayload }).user?.tenantId;
  const appointment = await getAppointmentById(req.params.id!, tenantId);

  res.json({
    success: true,
    data: appointment,
  });
};

export const updateAppointmentStatusController = async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as Request & { user?: UserPayload }).user;
  if (!currentUser) {
    throw new BadRequestError('Unauthorized');
  }

  const tenantId = currentUser.businessId || currentUser.tenantId;

  try {
    const validated = updateStatusSchema.parse(req.body);
    const appointment = await updateAppointmentStatus(req.params.id!, validated.status, tenantId);

    await createAuditLog(
      'appointments',
      'update_status',
      currentUser.id,
      'staff',
      `Appointment status updated to ${validated.status}`,
      undefined,
      { status: validated.status },
      { appointmentId: req.params.id! },
      req.ip!,
      req.get('user-agent')!,
      tenantId
    );

    res.json({
      success: true,
      data: appointment,
      message: 'Appointment status updated',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new BadRequestError(error.errors.map((e) => e.message).join(', '));
    }
    throw error;
  }
};
