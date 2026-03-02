/**
 * Simple logger utility
 * Provides console-based logging for development
 * Note: Use core/utils/logger for production (Winston-based)
 */

const logger = {
  error: (message, meta = {}) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}${metaStr}`);
  },

  info: (message, meta = {}) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    console.log(`[INFO] ${new Date().toISOString()} - ${message}${metaStr}`);
  },

  warn: (message, meta = {}) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}${metaStr}`);
  },

  debug: (message, meta = {}) => {
    if (process.env.NODE_ENV === 'development') {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}${metaStr}`);
    }
  },
};

module.exports = logger;
