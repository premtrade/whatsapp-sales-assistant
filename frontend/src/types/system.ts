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

export interface WhatsAppTestResult {
  success: boolean;
  message: string;
}

export interface SystemHealthItem {
  label: string;
  status: 'operational' | 'warning' | 'error';
  detail: string;
}

export interface SystemHealthResponse {
  services: SystemHealthItem[];
  overall: 'operational' | 'degraded' | 'down';
}

export interface SystemMetrics {
  uptime: number;
  memory: { used: number; total: number; percent: number };
  cpu: { user: number; system: number };
  connections: number;
}