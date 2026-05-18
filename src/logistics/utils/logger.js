'use strict';

const baseLogger = require('../../core/utils/logger');

const PREFIX = '[logistics]';

function wrap(level) {
  return (message, meta) => {
    if (typeof baseLogger[level] === 'function') {
      baseLogger[level](`${PREFIX} ${message}`, meta);
    }
  };
}

module.exports = {
  info: wrap('info'),
  warn: wrap('warn'),
  error: wrap('error'),
  debug: wrap('debug'),
};
