function formatMessage(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
}

const logger = {
  info(message) {
    console.log(formatMessage('info', message));
  },
  warn(message) {
    console.warn(formatMessage('warn', message));
  },
  error(message) {
    const errorMessage = message instanceof Error ? message.message : message;
    const stack = message instanceof Error ? message.stack : undefined;
    console.error(formatMessage('error', errorMessage));
    if (stack && process.env.NODE_ENV === 'development') console.error(stack);
  },
  debug(message) {
    if (process.env.NODE_ENV === 'development') {
      console.log(formatMessage('debug', message));
    }
  },
};

module.exports = { logger };
