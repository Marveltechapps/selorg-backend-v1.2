/**
 * Environment variable validation
 * Ensures all required environment variables are present and valid
 * Called on application startup
 */

const logger = require('../core/utils/logger');

/**
 * Validates MongoDB URI format
 */
const validateMongoURI = (uri) => {
  if (!uri) return false;
  
  // Basic validation - should start with mongodb:// or mongodb+srv://
  const mongoPattern = /^mongodb(\+srv)?:\/\//;
  return mongoPattern.test(uri);
};

/**
 * Validates JWT secret strength
 */
const validateJWTSecret = (secret) => {
  if (!secret) {
    return { valid: false, message: 'JWT_SECRET is required' };
  }

  if (secret.length < 32) {
    return {
      valid: false,
      message: `JWT_SECRET must be at least 32 characters long. Current length: ${secret.length}. Generate with: openssl rand -base64 32`,
    };
  }

  // Check for common weak secrets
  const weakSecrets = ['your-secret-key', 'change-me', 'secret', 'password', '123456'];
  if (weakSecrets.includes(secret.toLowerCase())) {
    return {
      valid: false,
      message: 'JWT_SECRET is too weak. Please use a strong, randomly generated secret.',
    };
  }

  return { valid: true };
};

/**
 * Validates all required environment variables
 */
const validateEnvironment = () => {
  const errors = [];
  const warnings = [];

  // Required variables
  const required = ['MONGO_URI', 'JWT_SECRET'];
  
  for (const key of required) {
    const value = process.env[key] || process.env[key === 'MONGO_URI' ? 'MONGODB_URI' : key];
    if (!value) {
      errors.push(`${key} is required but not set`);
    }
  }

  // Validate MONGO_URI format
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (mongoUri && !validateMongoURI(mongoUri)) {
    errors.push('MONGO_URI format is invalid. Must start with mongodb:// or mongodb+srv://');
  }

  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET) {
    const jwtValidation = validateJWTSecret(process.env.JWT_SECRET);
    if (!jwtValidation.valid) {
      errors.push(jwtValidation.message || 'JWT_SECRET validation failed');
    }
  }

  // Warnings for optional but recommended variables
  if (!process.env.ALLOWED_ORIGINS) {
    warnings.push('ALLOWED_ORIGINS not set - CORS will allow all origins (not recommended for production)');
  }

  if (!process.env.NODE_ENV) {
    warnings.push('NODE_ENV not set - defaulting to development');
  }

  // Log warnings
  if (warnings.length > 0) {
    warnings.forEach(warning => logger.warn(warning));
  }

  // Throw error if any required validations fail
  if (errors.length > 0) {
    const errorMessage = `Environment validation failed:\n${errors.join('\n')}`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  logger.info('Environment validation passed', {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || '5000',
    hasMongoURI: !!mongoUri,
    hasJWTSecret: !!process.env.JWT_SECRET,
    hasCustomerJWTSecret: !!process.env.CUSTOMER_JWT_SECRET,
    hasAllowedOrigins: !!process.env.ALLOWED_ORIGINS,
  });
};

// CommonJS export for backward compatibility
module.exports = validateEnvironment;