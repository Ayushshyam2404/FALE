import dotenv from 'dotenv';

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function optional(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === null || value.trim() === '') {
    return fallback;
  }
  return value.trim();
}

function optionalNumber(name, fallback) {
  const value = Number(optional(name, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

function optionalBool(name, fallback) {
  const value = optional(name, fallback ? 'true' : 'false');
  return value === 'true' || value === '1';
}

const WHATSAPP_PROVIDER = optional('WHATSAPP_PROVIDER', 'cloud').toLowerCase();

const WHATSAPP = {
  PROVIDER: WHATSAPP_PROVIDER,
  RECIPIENT: required('WHATSAPP_RECIPIENT'),
  VERIFY_TOKEN: optional('WHATSAPP_VERIFY_TOKEN', ''),
};

if (WHATSAPP_PROVIDER === 'cloud') {
  WHATSAPP.ACCESS_TOKEN = required('WHATSAPP_ACCESS_TOKEN');
  WHATSAPP.PHONE_NUMBER_ID = required('WHATSAPP_PHONE_NUMBER_ID');
  WHATSAPP.API_VERSION = optional('WHATSAPP_API_VERSION', 'v21.0');
} else {
  WHATSAPP.ACCESS_TOKEN = null;
  WHATSAPP.PHONE_NUMBER_ID = null;
  WHATSAPP.API_VERSION = 'v21.0';
}

const env = {
  NODE_ENV: optional('NODE_ENV', 'development'),
  PORT: optionalNumber('PORT', 3000),

  MONGO_URI: required('MONGO_URI'),
  REDIS_URL: optional('REDIS_URL', 'redis://127.0.0.1:6379'),

  IMAP: {
    HOST: required('IMAP_HOST'),
    PORT: optionalNumber('IMAP_PORT', 993),
    SECURE: optionalBool('IMAP_SECURE', true),
    USER: required('IMAP_USER'),
    PASSWORD: required('IMAP_PASSWORD'),
    MAILBOX: optional('IMAP_MAILBOX', 'INBOX'),
  },

  SMTP: {
    HOST: required('SMTP_HOST'),
    PORT: optionalNumber('SMTP_PORT', 465),
    SECURE: optionalBool('SMTP_SECURE', true),
    USER: required('SMTP_USER'),
    PASSWORD: required('SMTP_PASSWORD'),
  },

  SENDER_NAME: optional('SENDER_NAME', 'Falcon AI'),
  SIGNATURE: optional('SIGNATURE', ''),

  OPENROUTER: {
    API_KEY: required('OPENROUTER_API_KEY'),
    MODEL: optional('OPENROUTER_MODEL', 'openai/gpt-4o-mini'),
    SITE_URL: optional('OPENROUTER_SITE_URL', 'https://falcon.local'),
    APP_NAME: optional('OPENROUTER_APP_NAME', 'Falcon AI'),
  },

  WHATSAPP,

  WEBHOOK_PUBLIC_URL: optional('WEBHOOK_PUBLIC_URL', ''),

  POLL_INTERVAL_MS: optionalNumber('POLL_INTERVAL_MS', 60000),
  POLL_MAX_FETCH: optionalNumber('POLL_MAX_FETCH', 100),
  FIRST_RUN_MAX_FETCH: optionalNumber('FIRST_RUN_MAX_FETCH', 20),

  UPLOAD_DIR: optional('UPLOAD_DIR', 'uploads'),

  ENABLE_WORKERS: optionalBool('ENABLE_WORKERS', true),
  WORKER_ROLE: optionalBool('WORKER_ROLE', false),
};

export default env;
