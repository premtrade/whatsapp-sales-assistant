import { Request, Response } from 'express';
import { UserPayload } from '../types';
import { BadRequestError } from '../utils/errors';
import {
  getCrmSettings,
  saveCrmSettings,
  testCrmConnection,
  SaveCrmSettingsInput,
} from '../services/crm.service';
import { createAuditLog } from '../services/audit.service';

function tenantOf(req: Request): string | undefined {
  const user = (req as Request & { user?: UserPayload }).user;
  return user?.businessId || user?.tenantId;
}

/** GET /api/integrations/crm — read the tenant's CRM settings (key masked). */
export const getCrmConfig = async (req: Request, res: Response): Promise<void> => {
  const tenantId = tenantOf(req);
  if (!tenantId) throw new BadRequestError('Business context required');
  const settings = await getCrmSettings(tenantId);
  res.json({ success: true, data: settings });
};

const validateSave = (body: unknown): SaveCrmSettingsInput => {
  const data = (body || {}) as Partial<SaveCrmSettingsInput>;
  const provider = data.provider;
  if (provider !== 'odoo' && provider !== 'none') {
    throw new BadRequestError("provider must be 'odoo' or 'none'");
  }
  const odoo = data.odoo || { url: '', database: '' };
  if (provider === 'odoo') {
    if (!odoo.url || !odoo.url.trim()) {
      throw new BadRequestError('odoo.url is required when provider is odoo');
    }
  }
  return {
    provider,
    enabled: Boolean(data.enabled),
    odoo: {
      url: odoo.url || '',
      database: odoo.database || '',
      apiKey: odoo.apiKey,
    },
  };
};

/** PUT /api/integrations/crm — save the tenant's CRM settings. */
export const updateCrmConfig = async (req: Request, res: Response): Promise<void> => {
  const tenantId = tenantOf(req);
  if (!tenantId) throw new BadRequestError('Business context required');
  const user = (req as Request & { user?: UserPayload }).user;

  const input = validateSave(req.body);
  const settings = await saveCrmSettings(tenantId, input);

  await createAuditLog(
    'integrations',
    'update_crm_config',
    user?.id || null,
    'staff',
    `CRM integration updated (provider=${input.provider}, enabled=${input.enabled})`,
    undefined,
    { provider: input.provider, enabled: input.enabled },
    undefined,
    req.ip,
    req.get('user-agent'),
    tenantId
  );

  res.json({ success: true, data: settings, message: 'CRM settings saved' });
};

/** POST /api/integrations/crm/test — verify the stored Odoo connection. */
export const testCrmConfig = async (req: Request, res: Response): Promise<void> => {
  const tenantId = tenantOf(req);
  if (!tenantId) throw new BadRequestError('Business context required');
  const result = await testCrmConnection(tenantId);
  res.json({ success: result.success, message: result.message });
};
