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

   email: {
     provider: string;
     sendgridApiKey: string;
     resendApiKey: string;
     smtp2goApiKey: string;
     brevoApiKey: string;
     fromEmail: string;
     fromName: string;
     supportEmail: string;
   };

   ai: {
     defaultModel: string;
     embeddingModel: string;
   };

  billing: {
    provider: string;
    accountName: string;
    accountNumber: string;
    bankName: string;
    paymentEmail: string;
    paymentPhone: string;
    renewalWindowDays: number;
  };

  // The WhatsApp number a visitor can message from the marketing site.
  //
  // It is configured here rather than read from a tenant, because a tenant's
  // whatsapp_phone can be a placeholder and must never be published. If this
  // is empty the "message our agent" button is not shown at all.
  demoAgent: {
    whatsappNumber: string;
    whatsappName: string;
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
    secret: getEnv('JWT_SECRET'),
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

  email: {
    // Which transactional email provider to use. SendGrid is only the default,
    // not a requirement - see docs/BILLING.md for the free-tier options.
    provider: getEnv('EMAIL_PROVIDER', 'sendgrid'),
    sendgridApiKey: getEnv('SENDGRID_API_KEY', ''),
    resendApiKey: getEnv('RESEND_API_KEY', ''),
    smtp2goApiKey: getEnv('SMTP2GO_API_KEY', ''),
    brevoApiKey: getEnv('BREVO_API_KEY', ''),
    fromEmail: getEnv('SENDGRID_FROM_EMAIL', ''),
    fromName: getEnv('SENDGRID_FROM_NAME', 'WAFLO Support'),
    supportEmail: getEnv('SUPPORT_EMAIL', ''),
  },

  ai: {
    // Must stay in sync with the model configured on the n8n 'Workflow 2 - AI Brain' Groq node.
    defaultModel: getEnv('AI_DEFAULT_MODEL', 'qwen/qwen3.8-27b'),
    // Must stay in sync with backend/src/services/embedding.ts and the pgvector column dimension.
    embeddingModel: getEnv('EMBEDMENT_MODEL', 'gemini-embedding-001'),
  },

  // Which provider collects subscription payments. Stripe does not support
  // Jamaica as a merchant country, so a deployment without a Stripe account
  // falls back to offline (bank transfer) billing automatically.
  billing: {
    provider: getEnv('BILLING_PROVIDER', ''),
    accountName: getEnv('BILLING_ACCOUNT_NAME', ''),
    accountNumber: getEnv('BILLING_ACCOUNT_NUMBER', ''),
    bankName: getEnv('BILLING_BANK_NAME', ''),
    paymentEmail: getEnv('BILLING_PAYMENT_EMAIL', ''),
    paymentPhone: getEnv('BILLING_PAYMENT_PHONE', ''),
    renewalWindowDays: getEnvNumber('BILLING_RENEWAL_WINDOW_DAYS', 7),
  },

  demoAgent: {
    whatsappNumber: getEnv('DEMO_AGENT_WHATSAPP_NUMBER', ''),
    whatsappName: getEnv('DEMO_AGENT_WHATSAPP_NAME', 'ROLINJ.IO'),
  },
};

// Fail fast in production if the JWT signing key is missing, too short, or still a default value.
// A weak/default key lets anyone forge super-admin tokens and bypass all authorization.
if (config.env === 'production') {
  const { secret } = config.jwt;
  if (!secret || secret.length < 32 || secret.startsWith('change_me')) {
    throw new Error(
      'Refusing to start: JWT_SECRET must be set, at least 32 characters, and not a default value in production',
    );
  }
}
