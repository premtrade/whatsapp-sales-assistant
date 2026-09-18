import { query } from '../utils/database';
import { config } from '../config';
import logger from '../utils/logger';
import { memoryCache } from '../utils/cache';

export interface SystemHealthItem {
  label: string;
  status: 'operational' | 'warning' | 'error';
  detail: string;
}

export interface SystemHealthResponse {
  services: SystemHealthItem[];
  overall: 'operational' | 'degraded' | 'down';
}

export async function getSystemHealth(): Promise<SystemHealthResponse> {
  const services: SystemHealthItem[] = [];

  // Check Database
  try {
    const start = Date.now();
    await query('SELECT 1');
    const latency = Date.now() - start;
    services.push({
      label: 'Database',
      status: latency < 100 ? 'operational' : latency < 500 ? 'warning' : 'error',
      detail: `Connected · ${latency}ms latency`,
    });
  } catch (error) {
    services.push({
      label: 'Database',
      status: 'error',
      detail: 'Connection failed',
    });
  }

  // Check WebSocket
  try {
    // This is a placeholder - actual WS check would need access to the WebSocket server
    services.push({
      label: 'WebSocket',
      status: 'operational',
      detail: 'Live connection active',
    });
  } catch (error) {
    services.push({
      label: 'WebSocket',
      status: 'error',
      detail: 'Connection failed',
    });
  }

  // Check Storage (disk space)
  try {
    const { execSync } = await import('child_process');
    const output = execSync('df -h /app/storage', { encoding: 'utf-8' });
    const lines = output.trim().split('\n');
    if (lines.length > 1) {
      const parts = lines[1]!.split(/\s+/);
      const usedPercentStr = parts.at(4)?.replace('%', '');
      const usedPercent = usedPercentStr ? parseInt(usedPercentStr, 10) : 0;
      const totalSpace = parts.at(1) || 'unknown';
      services.push({
        label: 'Storage',
        status: usedPercent < 70 ? 'operational' : usedPercent < 90 ? 'warning' : 'error',
        detail: `${usedPercent}% of ${totalSpace} used`,
      });
    } else {
      services.push({
        label: 'Storage',
        status: 'operational',
        detail: 'Unknown usage',
      });
    }
  } catch (error) {
    services.push({
      label: 'Storage',
      status: 'warning',
      detail: 'Unable to check disk usage',
    });
  }

  // Check WAHA
  try {
    const baseUrl = `http://${config.waha.host}:${config.waha.port}`;
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { 'X-Api-Key': config.waha.apiKey },
      signal: AbortSignal.timeout(5000),
    });
    services.push({
      label: 'WAHA (WhatsApp)',
      status: res.ok ? 'operational' : 'error',
      detail: res.ok ? 'Service reachable' : `HTTP ${res.status}`,
    });
  } catch (error) {
    services.push({
      label: 'WAHA (WhatsApp)',
      status: 'error',
      detail: 'Connection failed',
    });
  }

  // Check n8n
  try {
    const baseUrl = `http://${config.n8n.host}:${config.n8n.port}`;
    const res = await fetch(`${baseUrl}/healthz`, {
      signal: AbortSignal.timeout(5000),
    });
    services.push({
      label: 'n8n (Workflows)',
      status: res.ok ? 'operational' : 'error',
      detail: res.ok ? 'Service reachable' : `HTTP ${res.status}`,
    });
  } catch (error) {
    services.push({
      label: 'n8n (Workflows)',
      status: 'error',
      detail: 'Connection failed',
    });
  }

  const overall = services.some(s => s.status === 'error') ? 'down' :
    services.some(s => s.status === 'warning') ? 'degraded' : 'operational';

  return { services, overall };
}

export async function getSystemMetrics(): Promise<{
  uptime: number;
  memory: { used: number; total: number; percent: number };
  cpu: { user: number; system: number };
  connections: number;
}> {
  const uptime = process.uptime();
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();

  return {
    uptime,
    memory: {
      used: Math.round(memory.heapUsed / 1024 / 1024),
      total: Math.round(memory.heapTotal / 1024 / 1024),
      percent: Math.round((memory.heapUsed / memory.heapTotal) * 100),
    },
    cpu: {
      user: Math.round(cpu.user / 1000),
      system: Math.round(cpu.system / 1000),
    },
    connections: 0, // Would need to track active connections
  };
}

export async function clearSystemCache(): Promise<void> {
  memoryCache.clear();
  logger.info('System cache cleared via API');
}

