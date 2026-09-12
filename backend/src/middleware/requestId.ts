import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import logger from '../utils/logger';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.headers['x-request-id']?.toString() || randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);

  (req as any).requestId = requestId;

  logger.debug('Request received', {
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
  });

  const originalSend = res.send.bind(res);
  res.send = function (body: any) {
    logger.debug('Request completed', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
    });
    return originalSend(body);
  };

  next();
}
