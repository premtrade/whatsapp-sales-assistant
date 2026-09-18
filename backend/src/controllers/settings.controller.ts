import { Request, Response } from 'express';
import { z } from 'zod';
import { getSettings, getSettingByKey, updateSetting, createSetting, exportSettingsForTenant, importSettingsForTenant } from '../services/settings.service';
import { createAuditLog } from '../services/audit.service';
import { UserPayload } from '../types';
import { BadRequestError } from '../utils/errors';

const updateSettingSchema = z.object({
  setting_key: z.string().min(1, 'setting_key is required'),
  setting_value: z.string(),
});

const createSettingSchema = z.object({
  setting_key: z.string().min(1).regex(/^[a-z0-9_]+$/i),
  setting_value: z.string().nullable().optional(),
  data_type: z.enum(['string', 'integer', 'decimal', 'boolean', 'json']).optional(),
  description: z.string().nullable().optional(),
});

const importSettingsSchema = z.object({
  settings: z.array(z.object({
    key: z.string().min(1),
    value: z.string(),
  })),
});

function currentUser(req: Request): UserPayload {
  const user = (req as Request & { user?: UserPayload }).user;
  if (!user) throw new BadRequestError('Unauthorized');
  return user;
}

function getTenantId(req: Request): string {
  const user = (req as Request & { user?: UserPayload }).user;
  const tenantId = user?.businessId || user?.tenantId;
  if (!tenantId) throw new BadRequestError('Tenant scope required');
  return tenantId;
}

export const listSettings = async (req: Request, res: Response): Promise<void> => {
  const tenantId = getTenantId(req);
  const settings = await getSettings(tenantId);
  res.json({ success: true, data: settings });
};

export const getSetting = async (req: Request, res: Response): Promise<void> => {
  const tenantId = getTenantId(req);
  const setting = await getSettingByKey(req.params.key!, tenantId);
  res.json({ success: true, data: setting });
};

export const updateSettingController = async (req: Request, res: Response): Promise<void> => {
  const user = currentUser(req);
  const tenantId = getTenantId(req);
  const validated = updateSettingSchema.parse(req.body);
  const oldSetting = await getSettingByKey(validated.setting_key, tenantId).catch(() => null);
  if (!oldSetting) throw new BadRequestError(`Setting '${validated.setting_key}' not found`);

  const updated = await updateSetting(validated.setting_key, validated.setting_value, tenantId);

  await createAuditLog(
    'settings',
    'update',
    user.id,
    'staff',
    `Setting '${validated.setting_key}' updated`,
    { setting_key: oldSetting.setting_key, old_value: oldSetting.setting_value },
    { setting_key: updated.setting_key, new_value: updated.setting_value },
    { settingKey: validated.setting_key },
    req.ip,
    req.get('user-agent'),
    tenantId
  );
  res.json({ success: true, data: updated });
};

export const createSettingController = async (req: Request, res: Response): Promise<void> => {
  const user = currentUser(req);
  const tenantId = getTenantId(req);
  const validated = createSettingSchema.parse(req.body);
  const created = await createSetting({
    setting_key: validated.setting_key,
    setting_value: validated.setting_value ?? null,
    data_type: validated.data_type,
    description: validated.description ?? null,
  }, tenantId);

  await createAuditLog(
    'settings',
    'create',
    user.id,
    'staff',
    `Setting '${created.setting_key}' created`,
    undefined,
    { setting_key: created.setting_key, value: created.setting_value },
    { settingKey: created.setting_key },
    req.ip,
    req.get('user-agent'),
    tenantId
  );
  res.status(201).json({ success: true, data: created });
};

export const exportSettingsController = async (req: Request, res: Response): Promise<void> => {
  const user = currentUser(req);
  const tenantId = getTenantId(req);
  const exportData = await exportSettingsForTenant(tenantId);

  await createAuditLog(
    'settings',
    'export',
    user.id,
    'staff',
    'Tenant configuration exported',
    undefined,
    { exportedKeysCount: (exportData.settings as any[]).length },
    { tenantId },
    req.ip,
    req.get('user-agent'),
    tenantId
  );

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=config-${tenantId}.json`);
  res.json({ success: true, data: exportData });
};

export const importSettingsController = async (req: Request, res: Response): Promise<void> => {
  const user = currentUser(req);
  const tenantId = getTenantId(req);
  const validated = importSettingsSchema.parse(req.body);

  const result = await importSettingsForTenant(validated.settings, tenantId);

  await createAuditLog(
    'settings',
    'import',
    user.id,
    'staff',
    `Imported configuration (${result.updated} updated, ${result.failed} failed)`,
    undefined,
    result,
    { tenantId },
    req.ip,
    req.get('user-agent'),
    tenantId
  );

  res.json({
    success: true,
    data: result,
    message: `Configuration import complete: ${result.updated} updated, ${result.failed} failed`,
  });
};
