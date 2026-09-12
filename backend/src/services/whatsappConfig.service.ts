import { config } from '../config';
import { getSettingByKey } from './settings.service';
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

export async function getWhatsAppConfig(): Promise<WhatsAppConfig> {
  const [
    phoneNumberSetting,
    businessNameSetting,
    businessIdSetting,
    webhookUrlSetting,
    apiVersionSetting,
    messageLimitSetting,
  ] = await Promise.all([
    getSettingByKey('whatsapp_phone_number').catch(() => null),
    getSettingByKey('whatsapp_business_name').catch(() => null),
    getSettingByKey('whatsapp_business_id').catch(() => null),
    getSettingByKey('whatsapp_webhook_url').catch(() => null),
    getSettingByKey('whatsapp_api_version').catch(() => null),
    getSettingByKey('whatsapp_message_limit').catch(() => null),
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
    const session = config.waha.session || 'default';

    const [sessionRes, templatesRes, usageRes] = await Promise.allSettled([
      fetch(`${baseUrl}/api/sessions/${session}`, {
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

export async function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  const phoneNumberSetting = await getSettingByKey('whatsapp_phone_number').catch(() => null);
  const businessNameSetting = await getSettingByKey('whatsapp_business_name').catch(() => null);
  const businessIdSetting = await getSettingByKey('whatsapp_business_id').catch(() => null);

  let connected = false;
  let qrCode: string | undefined;

  try {
    const baseUrl = `http://${config.waha.host}:${config.waha.port}`;
    const session = config.waha.session || 'default';

    const sessionRes = await fetch(`${baseUrl}/api/sessions/${session}`, {
      headers: { 'X-Api-Key': config.waha.apiKey },
    });

    if (sessionRes.ok) {
      const sessionData = await sessionRes.json() as WAHASessionResponse;
      connected = sessionData.status === 'WORKING';
      if (sessionData.qr) {
        qrCode = sessionData.qr;
      }
    }
  } catch (error) {
    logger.warn('Failed to fetch WAHA session status', { error });
  }

  return {
    connected,
    session: config.waha.session || 'default',
    phoneNumber: phoneNumberSetting?.setting_value || '',
    businessName: businessNameSetting?.setting_value || '',
    qrCode,
  };
}

export async function testWhatsAppConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const baseUrl = `http://${config.waha.host}:${config.waha.port}`;
    const session = config.waha.session || 'default';

    const res = await fetch(`${baseUrl}/api/sessions/${session}`, {
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