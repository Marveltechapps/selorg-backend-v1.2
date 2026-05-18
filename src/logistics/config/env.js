'use strict';

const { z } = require('zod');
const baseLogger = require('../../core/utils/logger');

const logisticsEnvSchema = z.object({
  RABBITMQ_URL: z.string().url().optional(),
  LOGISTICS_EXCHANGE: z.string().default('logistics.events'),
  LOGISTICS_DLQ_EXCHANGE: z.string().default('logistics.events.dlq'),

  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  PORTER_API_BASE_URL: z.string().url().default('https://api.porter.in'),
  PORTER_API_KEY: z.string().optional(),
  PORTER_HMAC_SECRET: z.string().optional(),

  LOGISTICS_CRED_ENCRYPTION_KEY: z.string().optional(),

  LOGISTICS_ENABLED: z
    .union([z.boolean(), z.string()])
    .default(true)
    .transform((v) => (typeof v === 'string' ? v.toLowerCase() !== 'false' : Boolean(v))),
  LOGISTICS_FAILOVER_TIMEOUT_MS: z.coerce.number().default(15000),
});

let cachedConfig = null;

function getConfig() {
  if (cachedConfig) return cachedConfig;
  const parsed = logisticsEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    baseLogger.error('[logistics] env validation failed', { errors: flat });
    throw new Error('logistics env validation failed: ' + JSON.stringify(flat));
  }
  cachedConfig = parsed.data;
  baseLogger.info('[logistics] env loaded', {
    rabbitmq: Boolean(cachedConfig.RABBITMQ_URL),
    porterConfigured: Boolean(cachedConfig.PORTER_API_KEY),
    enabled: cachedConfig.LOGISTICS_ENABLED,
  });
  return cachedConfig;
}

function resetConfigForTests() {
  cachedConfig = null;
}

module.exports = { getConfig, resetConfigForTests };
