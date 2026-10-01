import { Request, Response } from 'express';
import { getWhatsAppConfig, getWhatsAppStatus, testWhatsAppConnection, connectWhatsAppSession, updateWhatsAppConfig } from '../services/whatsappConfig.service';
import { createAuditLog } from '../services/audit.service';
import { UserPayload } from '../types';

function getTenantId(req: Request): string {
  const user = (req as any).user;
  const tenantId = user?.businessId || user?.tenantId;
  if (!tenantId) throw new Error('Tenant scope required');
  return tenantId;
}

function currentUser(req: Request): UserPayload {
  const user = (req as Request & { user?: UserPayload }).user;
  if (!user) throw new Error('Unauthorized');
  return user;
}

export const getWhatsAppConfigController = async (req: Request, res: Response): Promise<void> => {
  const tenantId = getTenantId(req);
  const config = await getWhatsAppConfig(tenantId);
  res.json({ success: true, data: config });
};

export const getWhatsAppStatusController = async (req: Request, res: Response): Promise<void> => {
  const tenantId = getTenantId(req);
  const status = await getWhatsAppStatus(tenantId);
  res.json({ success: true, data: status });
};

export const connectWhatsAppSessionController = async (req: Request, res: Response): Promise<void> => {
  const tenantId = getTenantId(req);
  const status = await connectWhatsAppSession(tenantId);
  res.json({ success: true, data: status, message: status.connected ? 'WhatsApp connected' : 'Scan the QR code in WhatsApp to link this device' });
};

export const testWhatsAppConnectionController = async (req: Request, res: Response): Promise<void> => {
  const tenantId = getTenantId(req);
  const result = await testWhatsAppConnection(tenantId);
  res.json({ success: result.success, data: result, message: result.message });
};

export const updateWhatsAppConfigController = async (req: Request, res: Response): Promise<void> => {
  const user = currentUser(req);
  const tenantId = getTenantId(req);
  const body = req.body as Record<string, string>;

  const oldConfig = await getWhatsAppConfig(tenantId);
  const updated = await updateWhatsAppConfig(tenantId, {
    phoneNumber: body.phoneNumber,
    businessName: body.businessName,
    businessId: body.businessId,
    webhookUrl: body.webhookUrl,
    apiVersion: body.apiVersion,
    messageLimit: body.messageLimit,
  });

  await createAuditLog(
    'whatsapp',
    'update',
    user.id,
    'staff',
    'WhatsApp configuration updated',
    {
      phoneNumber: oldConfig.phoneNumber,
      businessName: oldConfig.businessName,
      webhookUrl: oldConfig.webhookUrl,
      apiVersion: oldConfig.apiVersion,
    },
    {
      phoneNumber: updated.phoneNumber,
      businessName: updated.businessName,
      webhookUrl: updated.webhookUrl,
      apiVersion: updated.apiVersion,
    },
    { tenantId },
    req.ip,
    req.get('user-agent'),
    tenantId
  );

  res.json({ success: true, data: updated });
};