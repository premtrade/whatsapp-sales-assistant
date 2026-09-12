import { Request, Response } from 'express';
import { z } from 'zod';
import { getSettings, getSettingByKey, updateSetting, createSetting } from '../services/settings.service';
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

function currentUser(req: Request): UserPayload {
  const user = (req as Request & { user?: UserPayload }).user;
  if (!user) throw new BadRequestError('Unauthorized');
  return user;
}

export const listSettings = async (_req: Request, res: Response): Promise<void> => {
  const settings = await getSettings();
  res.json({ success: true, data: settings });
};

export const getSetting = async (req: Request, res: Response): Promise<void> => {
  const setting = await getSettingByKey(req.params.key!);
  res.json({ success: true, data: setting });
};

export const updateSettingController = async (req: Request, res: Response): Promise<void> => {
  const user = currentUser(req);
  const validated = updateSettingSchema.parse(req.body);
  const oldSetting = await getSettingByKey(validated.setting_key).catch(() => null);
  if (!oldSetting) throw new BadRequestError(`Setting '${validated.setting_key}' not found`);
  const updated = await updateSetting(validated.setting_key, validated.setting_value);
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
    req.get('user-agent')
  );
  res.json({ success: true, data: updated });
};

export const createSettingController = async (req: Request, res: Response): Promise<void> => {
  const user = currentUser(req);
  const validated = createSettingSchema.parse(req.body);
  const created = await createSetting({
    setting_key: validated.setting_key,
    setting_value: validated.setting_value ?? null,
    data_type: validated.data_type,
    description: validated.description ?? null,
  });
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
    req.get('user-agent')
  );
  res.status(201).json({ success: true, data: created });
};

