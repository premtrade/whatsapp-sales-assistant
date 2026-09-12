export interface Config {
  env: string;
  port: number;
  corsOrigins: string[];
  logLevel: string;
  postgres: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    schema: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  waha: {
    apiKey: string;
    host: string;
    port: number;
    session: string;
  };
  n8n: {
    host: string;
    port: number;
  };
  gemini: {
    apiKey: string;
  };
}

function getEnv(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getEnvNumber(name: string, defaultValue?: number): number {
  const value = process.env[name];
  if (value === undefined || value === '') {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing required environment variable: ${name}`);
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid number for environment variable: ${name}`);
  }
  return parsed;
}

function getEnvBoolean(name: string, defaultValue = false): boolean {
  const value = process.env[name];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
}

function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export const config: Config = {
  env: getEnv('NODE_ENV', 'development'),
  port: getEnvNumber('BACKEND_PORT', 4000),
  corsOrigins: parseCorsOrigins(getEnv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:8080')),
  logLevel: getEnv('LOG_LEVEL', 'info'),
  postgres: {
    host: getEnv('POSTGRES_HOST', 'postgres'),
    port: getEnvNumber('POSTGRES_PORT', 5432),
    database: getEnv('POSTGRES_DB', 'whatsapp_sales'),
    user: getEnv('POSTGRES_USER', 'postgres'),
    password: getEnv('POSTGRES_PASSWORD'),
    schema: getEnv('POSTGRES_SCHEMA', 'public'),
  },
  jwt: {
    secret: getEnv('JWT_SECRET', getEnv('BACKEND_JWT_SECRET', 'change_me_to_a_random_64_char_string')),
    expiresIn: getEnv('JWT_EXPIRES_IN', '1d'),
  },
  waha: {
    apiKey: getEnv('WAHA_API_KEY', ''),
    host: getEnv('WAHA_HOST', 'waha'),
    port: getEnvNumber('WAHA_PORT', 3000),
    session: getEnv('WAHA_SESSION', 'default'),
  },
  n8n: {
    host: getEnv('N8N_HOST', 'n8n'),
    port: getEnvNumber('N8N_PORT', 5678),
  },
  gemini: {
    apiKey: getEnv('GEMINI_API_KEY', ''),
  },
};
