import { Request, Response } from 'express';
import { getWhatsAppConfig, getWhatsAppStatus, testWhatsAppConnection, connectWhatsAppSession } from '../services/whatsappConfig.service';

function getTenantId(req: Request): string {
  const user = (req as any).user;
  const tenantId = user?.businessId || user?.tenantId;
  if (!tenantId) throw new Error('Tenant scope required');
  return tenantId;
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