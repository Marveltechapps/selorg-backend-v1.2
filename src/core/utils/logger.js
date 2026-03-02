/**
 * Production-grade logger using Winston
 * Provides structured logging with multiple transports and log levels
 * Supports centralized logging: ELK, DataDog, CloudWatch
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

// Console format for development (human-readable)
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

// File transports for production
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_FILE_LOGGING === 'true') {
  // Error log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );

  // Combined log file (all levels)
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create Winston logger instance
const winstonLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: logFormat,
  defaultMeta: {
    service: 'selorg-backend',
    version: process.env.API_VERSION || '1.0.0',
  },
  transports,
  // Handle exceptions and rejections
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

// CommonJS export for backward compatibility
module.exports = logger;