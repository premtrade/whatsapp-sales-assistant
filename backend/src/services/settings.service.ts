import { query } from '../utils/database';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors';

export interface Setting {
  id: string;
  business_id: string;
  setting_key: string;
  setting_value: string | null;
  data_type: 'string' | 'integer' | 'decimal' | 'boolean' | 'json';
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

const DATA_TYPES = ['string', 'integer', 'decimal', 'boolean', 'json'] as const;

export function validateSettingValue(dataType: string, value: string | null): void {
  if (value === null || value === '') return;
  if (dataType === 'integer' && !/^-?\d+$/.test(value)) {
    throw new BadRequestError('Value must be a valid integer');
  }
  if (dataType === 'decimal' && !/^-?\d*\.?\d+$/.test(value)) {
    throw new BadRequestError('Value must be a valid number');
  }
  if (dataType === 'boolean' && !['true', 'false', '1', '0', 'yes', 'no'].includes(value.toLowerCase())) {
    throw new BadRequestError('Value must be a valid boolean (true/false)');
  }
  if (dataType === 'json') {
    try {
      JSON.parse(value);
    } catch {
      throw new BadRequestError('Value must be valid JSON');
    }
  }
}

export async function getSettings(tenantId: string): Promise<Setting[]> {
  const sql = `SELECT id, business_id, setting_key, setting_value, data_type, description, is_system, created_at, updated_at
     FROM settings
     WHERE business_id = $1
     ORDER BY is_system ASC, setting_key ASC`;
  const result = await query<Setting>(sql, [tenantId]);
  return result.rows;
}

export async function getSettingByKey(key: string, tenantId: string): Promise<Setting> {
  const sql = `SELECT id, business_id, setting_key, setting_value, data_type, description, is_system, created_at, updated_at
     FROM settings WHERE setting_key = $1 AND business_id = $2`;
  const result = await query<Setting>(sql, [key, tenantId]);
  const setting = result.rows[0];
  if (!setting) throw new NotFoundError(`Setting '${key}' not found for tenant`);
  return setting;
}

export async function updateSetting(key: string, value: string, tenantId: string): Promise<Setting> {
  const existing = await getSettingByKey(key, tenantId);
  validateSettingValue(existing.data_type, value);

  const sql = `UPDATE settings SET setting_value = $2, updated_at = NOW()
     WHERE setting_key = $1 AND business_id = $3
     RETURNING id, business_id, setting_key, setting_value, data_type, description, is_system, created_at, updated_at`;
  const result = await query<Setting>(sql, [key, value, tenantId]);
  const updated = result.rows[0];
  if (!updated) throw new NotFoundError(`Setting '${key}' not found for tenant`);
  return updated;
}

export async function createSetting(data: {
  setting_key: string;
  setting_value?: string | null;
  data_type?: string;
  description?: string | null;
}, tenantId: string): Promise<Setting> {
  const key = (data.setting_key || '').trim();
  if (!key || !/^[a-z0-9_]+$/i.test(key)) {
    throw new BadRequestError('setting_key is required (letters, numbers, underscores only)');
  }
  const dataType = data.data_type || 'string';
  if (!(DATA_TYPES as readonly string[]).includes(dataType as any)) {
    throw new BadRequestError(`data_type must be one of: ${DATA_TYPES.join(', ')}`);
  }
  const value = data.setting_value ?? null;
  validateSettingValue(dataType, value);
  try {
    const result = await query<Setting>(
      `INSERT INTO settings (setting_key, setting_value, data_type, description, business_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, business_id, setting_key, setting_value, data_type, description, is_system, created_at, updated_at`,
      [key, value, dataType, data.description || null, tenantId]
    );
    const created = result.rows[0];
    if (!created) throw new BadRequestError('Failed to create setting');
    return created;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && (error as { code?: string }).code === '23505') {
      throw new ConflictError(`Setting '${key}' already exists for this tenant`);
    }
    throw error;
  }
}

export async function exportSettingsForTenant(tenantId: string): Promise<Record<string, unknown>> {
  const settings = await getSettings(tenantId);
  const exportData: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    tenantId,
    settings: settings.map((s) => ({
      key: s.setting_key,
      value: s.setting_value,
      dataType: s.data_type,
      description: s.description,
      isSystem: s.is_system,
    })),
  };
  return exportData;
}

export async function importSettingsForTenant(
  settingsList: Array<{ key: string; value: string }>,
  tenantId: string
): Promise<{ updated: number; failed: number }> {
  let updated = 0;
  let failed = 0;

  for (const item of settingsList) {
    try {
      await updateSetting(item.key, item.value, tenantId);
      updated++;
    } catch {
      failed++;
    }
  }

  return { updated, failed };
}