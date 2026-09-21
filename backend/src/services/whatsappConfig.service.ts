import { config } from '../config';
import { getSettingByKey, getSettings } from './settings.service';
import { getBusinessById } from './business.service';
import { getWahaSessionInfo, ensureWahaSession } from './waha.service';
import logger from '../utils/logger';

interface WAHASessionResponse {
  status: string;
  qr?: string;
}

interface WAHATemplate {
  name: string;
  status: string;
  category: string;
}

interface WAHATemplatesResponse {
  templates: WAHATemplate[];
}

interface WAHAStatsResponse {
  messages_sent: number;
}

export interface WhatsAppConfig {
  phoneNumber: string;
  businessName: string;
  businessId: string;
  displayVerified: boolean;
  webhookUrl: string;
  webhookStatus: string;
  apiVersion: string;
  messageLimit: string;
  currentUsage: number;
  templates: Array<{
    name: string;
    status: string;
    category: string;
  }>;
}

export interface WhatsAppStatus {
  connected: boolean;
  session: string;
  phoneNumber: string;
  businessName: string;
  qrCode?: string;
}

async function resolveWahaSession(tenantId: string): Promise<string> {
  try {
    const business = await getBusinessById(tenantId);
    return business.waha_session_name || config.waha.session || 'default';
  } catch {
    return config.waha.session || 'default';
  }
}

export async function getTenantWahaSession(tenantId: string): Promise<string> {
  return resolveWahaSession(tenantId);
}

export async function getWhatsAppConfig(tenantId: string): Promise<WhatsAppConfig> {
  const [
    phoneNumberSetting,
    businessNameSetting,
    businessIdSetting,
    webhookUrlSetting,
    apiVersionSetting,
    messageLimitSetting,
  ] = await Promise.all([
    getSettingByKey('whatsapp_phone_number', tenantId).catch(() => null),
    getSettingByKey('whatsapp_business_name', tenantId).catch(() => null),
    getSettingByKey('whatsapp_business_id', tenantId).catch(() => null),
    getSettingByKey('whatsapp_webhook_url', tenantId).catch(() => null),
    getSettingByKey('whatsapp_api_version', tenantId).catch(() => null),
    getSettingByKey('whatsapp_message_limit', tenantId).catch(() => null),
  ]);

  const phoneNumber = phoneNumberSetting?.setting_value || '';
  const businessName = businessNameSetting?.setting_value || '';
  const businessId = businessIdSetting?.setting_value || '';
  const webhookUrl = webhookUrlSetting?.setting_value || '';
  const apiVersion = apiVersionSetting?.setting_value || 'v18.0';
  const messageLimit = parseInt(messageLimitSetting?.setting_value || '1000', 10);

  let currentUsage = 0;
  let templates: Array<{ name: string; status: string; category: string }> = [];
  let webhookStatus = 'inactive';

  try {
    const baseUrl = `http://${config.waha.host}:${config.waha.port}`;
    const session = await resolveWahaSession(tenantId);

    const [sessionRes, templatesRes, usageRes] = await Promise.allSettled([
      fetch(`${baseUrl}/api/sessions/${encodeURIComponent(session)}`, {
        headers: { 'X-Api-Key': config.waha.apiKey },
      }),
      fetch(`${baseUrl}/api/templates`, {
        headers: { 'X-Api-Key': config.waha.apiKey },
      }),
      fetch(`${baseUrl}/api/stats`, {
        headers: { 'X-Api-Key': config.waha.apiKey },
      }),
    ]);

    if (sessionRes.status === 'fulfilled' && sessionRes.value.ok) {
      const sessionData = await sessionRes.value.json() as WAHASessionResponse;
      webhookStatus = sessionData.status === 'WORKING' ? 'active' : 'inactive';
    }

    if (templatesRes.status === 'fulfilled' && templatesRes.value.ok) {
      const templatesData = await templatesRes.value.json() as WAHATemplatesResponse;
      templates = (templatesData.templates || []).map((t) => ({
        name: t.name,
        status: t.status,
        category: t.category,
      }));
    }

    if (usageRes.status === 'fulfilled' && usageRes.value.ok) {
      const usageData = await usageRes.value.json() as WAHAStatsResponse;
      currentUsage = usageData.messages_sent || 0;
    }
  } catch (error) {
    logger.warn('Failed to fetch WAHA data for WhatsApp config', { error });
  }

  return {
    phoneNumber,
    businessName,
    businessId,
    displayVerified: true,
    webhookUrl,
    webhookStatus,
    apiVersion,
    messageLimit: `${messageLimit} messages/24h`,
    currentUsage,
    templates,
  };
}

export async function getWhatsAppStatus(tenantId: string): Promise<WhatsAppStatus> {
  const phoneNumberSetting = await getSettingByKey('whatsapp_phone_number', tenantId).catch(() => null);
  const businessNameSetting = await getSettingByKey('whatsapp_business_name', tenantId).catch(() => null);
  const businessIdSetting = await getSettingByKey('whatsapp_business_id', tenantId).catch(() => null);

  const session = await resolveWahaSession(tenantId);

  let connected = false;
  let qrCode: string | undefined;
  let info = await getWahaSessionInfo(session).catch(() => null);

  // Self-service provisioning: if the tenant's session does not exist yet in
  // WAHA, create + start it so the QR flow can proceed without operator help.
  if (!info) {
    try {
      info = await ensureWahaSession(session);
      logger.info('Auto-provisioned WAHA session for tenant', { tenantId, session });
    } catch (error) {
      logger.warn('Failed to auto-provision WAHA session', { tenantId, session, error });
    }
  }

  if (info) {
    connected = info.status === 'WORKING';
    if (info.qr) {
      qrCode = info.qr;
    }
  }

  return {
    connected,
    session,
    phoneNumber: phoneNumberSetting?.setting_value || '',
    businessName: businessNameSetting?.setting_value || '',
    qrCode,
  };
}

export async function connectWhatsAppSession(tenantId: string): Promise<WhatsAppStatus> {
  const session = await resolveWahaSession(tenantId);
  try {
    await ensureWahaSession(session);
    logger.info('WhatsApp connect requested for tenant', { tenantId, session });
  } catch (error) {
    logger.error('Failed to ensure WAHA session on connect', { tenantId, session, error });
  }
  return getWhatsAppStatus(tenantId);
}

export async function testWhatsAppConnection(tenantId: string): Promise<{ success: boolean; message: string }> {
  try {
    const baseUrl = `http://${config.waha.host}:${config.waha.port}`;
    const session = await resolveWahaSession(tenantId);

    const res = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(session)}`, {
      headers: { 'X-Api-Key': config.waha.apiKey },
    });

    if (res.ok) {
      const data = await res.json() as WAHASessionResponse;
      return {
        success: data.status === 'WORKING',
        message: data.status === 'WORKING' ? 'WhatsApp connected successfully' : `WhatsApp status: ${data.status}`,
      };
    }

    return { success: false, message: `WAHA responded with ${res.status}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message: `Connection test failed: ${message}` };
  }
}
