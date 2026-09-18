import { Request, Response } from 'express';
import { getContacts, getContactWithDetails, searchContacts, getCustomerFactsByContactId } from '../services/contact.service';
import { getPagination, getOptionalString } from '../utils/helpers';
import { AuthenticatedRequest } from '../types';

export const listContacts = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, sortBy, sortOrder } = getPagination(req.query as Record<string, unknown>);
  const query = req.query as Record<string, unknown>;
  const tenantId = (req as AuthenticatedRequest).user?.businessId || (req as AuthenticatedRequest).user?.tenantId;

  const result = await getContacts({
    page,
    limit,
    sortBy,
    sortOrder,
    businessId: tenantId,
    search: getOptionalString(query.search),
    status: getOptionalString(query.status),
    source: getOptionalString(query.source),
    tags: Array.isArray(query.tags) ? query.tags.map(String) : undefined,
  });

  res.json({
    success: true,
    data: result.data,
    meta: result.meta,
  });
};

export const searchContactsController = async (req: Request, res: Response): Promise<void> => {
  const { q } = req.query;
  const tenantId = (req as AuthenticatedRequest).user?.businessId || (req as AuthenticatedRequest).user?.tenantId;

  if (!q || typeof q !== 'string') {
    res.json({
      success: true,
      data: [],
    });
    return;
  }

  const contacts = await searchContacts(q, parseInt(req.query.limit as string) || 20, tenantId);

  res.json({
    success: true,
    data: contacts,
  });
};

export const getContact = async (req: Request, res: Response): Promise<void> => {
  const tenantId = (req as AuthenticatedRequest).user?.businessId || (req as AuthenticatedRequest).user?.tenantId;
  const contact = await getContactWithDetails(req.params.id!, tenantId);

  res.json({
    success: true,
    data: contact,
  });
};

export const getContactFacts = async (req: Request, res: Response): Promise<void> => {
  const tenantId = (req as AuthenticatedRequest).user?.businessId || (req as AuthenticatedRequest).user?.tenantId;
  const facts = await getCustomerFactsByContactId(req.params.id!, tenantId);

  res.json({
    success: true,
    data: facts,
  });
};

