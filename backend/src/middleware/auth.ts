import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { config } from '../config';
import { UserPayload, AuthenticatedRequest } from '../types';

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      throw new UnauthorizedError('Missing token');
    }

    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload & Record<string, unknown>;

    req.user = {
      id: (decoded.userId || decoded.id) as string,
      email: (decoded.email as string) || '',
      role: (decoded.role as string) || '',
      employeeNumber: (decoded.employeeNumber as string) || (decoded.employee_number as string),
      firstName: (decoded.firstName as string) || (decoded.first_name as string) || '',
      lastName: (decoded.lastName as string) || (decoded.last_name as string) || '',
    };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired'));
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
      return;
    }
    next(error);
  }
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token) {
        const decoded = jwt.verify(token, config.jwt.secret) as UserPayload;
        req.user = decoded;
      }
    }
  } catch {
    // Silently ignore invalid tokens for optional auth
  }
  next();
};

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError(`Insufficient permissions. Requires: ${roles.join(', ')}`));
      return;
    }
    next();
  };
}

