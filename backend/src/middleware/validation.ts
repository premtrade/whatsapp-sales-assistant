import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/errors';
import { z } from 'zod';

export const validateBody = (schema: z.ZodType<unknown>) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Validation failed';
      next(new ValidationError(message));
    }
  };
};

export const sanitizeString = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[<>]/g, '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

export const sanitizeObject = <T extends Record<string, unknown>>(obj: T): T => {
  const sanitized = { ...obj } as Record<string, unknown>;
  for (const key in sanitized) {
    if (typeof sanitized[key] === 'string') {
      sanitized[key] = sanitizeString(sanitized[key] as string);
    }
  }
  return sanitized as T;
};

export const sanitizePagination = (req: Request, res: Response, next: NextFunction): void => {
  const query = req.query;

  if (query.page !== undefined) {
    const page = parseInt(query.page as string, 10);
    if (!isNaN(page) && page >= 1) {
      (req as any).page = page;
    }
  }
  if (query.limit !== undefined) {
    const limit = parseInt(query.limit as string, 10);
    if (!isNaN(limit) && limit >= 1) {
      (req as any).limit = Math.min(limit, 100);
    }
  }
  if (query.sortOrder !== undefined) {
    const order = (query.sortOrder as string).toLowerCase();
    if (order === 'asc' || order === 'desc') {
      (req as any).sortOrder = order;
    }
  }
  next();
};

export const parseId = (id: unknown): string => {
  if (typeof id !== 'string' || !id) {
    throw new ValidationError('Invalid ID format');
  }
  return id;
};

export const parseUuid = (id: unknown): string => {
  const str = parseId(id);
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(str)) {
    throw new ValidationError('Invalid UUID format');
  }
  return str;
};
