import { Request, Response } from 'express';
import { getWhatsAppConfig, getWhatsAppStatus, testWhatsAppConnection } from '../services/whatsappConfig.service';

export const getWhatsAppConfigController = async (_req: Request, res: Response): Promise<void> => {
  const config = await getWhatsAppConfig();
  res.json({ success: true, data: config });
};

export const getWhatsAppStatusController = async (_req: Request, res: Response): Promise<void> => {
  const status = await getWhatsAppStatus();
  res.json({ success: true, data: status });
};

export const testWhatsAppConnectionController = async (_req: Request, res: Response): Promise<void> => {
  const result = await testWhatsAppConnection();
  res.json({ success: result.success, data: result, message: result.message });
};