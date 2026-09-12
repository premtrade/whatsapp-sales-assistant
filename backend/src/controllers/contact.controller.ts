import { Request, Response } from 'express';
import { getContacts, getContactById, getContactWithDetails, searchContacts, getCustomerFactsByContactId } from '../services/contact.service';
import { getPagination, getOptionalString } from '../utils/helpers';

export const listContacts = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, sortBy, sortOrder } = getPagination(req.query as Record<string, unknown>);
  const query = req.query as Record<string, unknown>;

  const result = await getContacts({
    page,
    limit,
    sortBy,
    sortOrder,
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

  if (!q || typeof q !== 'string') {
    res.json({
      success: true,
      data: [],
    });
    return;
  }

  const contacts = await searchContacts(q, parseInt(req.query.limit as string) || 20);

  res.json({
    success: true,
    data: contacts,
  });
};

export const getContact = async (req: Request, res: Response): Promise<void> => {
  const contact = await getContactWithDetails(req.params.id!);

  res.json({
    success: true,
    data: contact,
  });
};

export const getContactFacts = async (req: Request, res: Response): Promise<void> => {
  const facts = await getCustomerFactsByContactId(req.params.id!);

  res.json({
    success: true,
    data: facts,
  });
};
