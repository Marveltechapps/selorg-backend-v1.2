/**
 * Centralized logging configuration
 * Supports multiple transports: Console, File, ELK, DataDog, CloudWatch
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

// Define transports
const transports = [
  // Console transport (always enabled)
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' ? logFormat : consoleFormat,
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  }),
];

// File transports
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_FILE_LOGGING === 'true') {
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// ELK Stack (Elasticsearch) transport
if (process.env.ELASTICSEARCH_URL) {
  try {
    const { ElasticsearchTransport } = require('winston-elasticsearch');
    transports.push(
      new ElasticsearchTransport({
        level: 'info',
        clientOpts: {
          node: process.env.ELASTICSEARCH_URL,
          auth: process.env.ELASTICSEARCH_AUTH ? {
            username: process.env.ELASTICSEARCH_USERNAME,
            password: process.env.ELASTICSEARCH_PASSWORD,
          } : undefined,
        },
        index: process.env.ELASTICSEARCH_INDEX || 'selorg-logs',
      })
    );
  } catch (err) {
    logger.warn('ELK transport not available:', err.message);
  }
}

// DataDog transport
if (process.env.DATADOG_API_KEY) {
  try {
    const { DatadogTransport } = require('winston-datadog-logs');
    transports.push(
      new DatadogTransport({
        apiKey: process.env.DATADOG_API_KEY,
        hostname: process.env.DATADOG_HOSTNAME || require('os').hostname(),
        service: process.env.DATADOG_SERVICE || 'selorg-backend',
        ddsource: 'nodejs',
        ddtags: `env:${process.env.NODE_ENV || 'development'}`,
        level: 'info',
      })
    );
  } catch (err) {
    logger.warn('DataDog transport not available:', err.message);
  }
}

// AWS CloudWatch transport
if (process.env.AWS_REGION && process.env.CLOUDWATCH_LOG_GROUP) {
  try {
    const WinstonCloudWatch = require('winston-cloudwatch');
const logger = require('../core/utils/logger');
    transports.push(
      new WinstonCloudWatch({
        logGroupName: process.env.CLOUDWATCH_LOG_GROUP,
        logStreamName: `${process.env.CLOUDWATCH_LOG_STREAM || 'selorg-backend'}-${Date.now()}`,
        awsRegion: process.env.AWS_REGION,
        messageFormatter: ({ level, message, ...meta }) => {
          return JSON.stringify({
            level,
            message,
            ...meta,
            timestamp: new Date().toISOString(),
          });
        },
      })
    );
  } catch (err) {
    logger.warn('CloudWatch transport not available:', err.message);
  }
}

// Create Winston logger instance
const winstonLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: logFormat,
  defaultMeta: {
    service: 'selorg-backend',
    version: process.env.API_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  },
  transports,
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      format: logFormat,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      format: logFormat,
    }),
  ],
});

// Enhanced logger interface with structured logging
class Logger {
  error(message, context) {
    winstonLogger.error(message, context);
  }

  warn(message, context) {
    winstonLogger.warn(message, context);
  }

  info(message, context) {
    winstonLogger.info(message, context);
  }

  debug(message, context) {
    winstonLogger.debug(message, context);
  }

  // Additional helper methods
  logRequest(req, res, duration) {
    const context = {
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      userId: req.user?.userId,
      ...(duration && { duration }),
    };
    winstonLogger.info('HTTP Request', context);
  }

  logError(error, context) {
    winstonLogger.error(error.message, {
      ...context,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
  }
}

const logger = new Logger();

module.exports = logger;
