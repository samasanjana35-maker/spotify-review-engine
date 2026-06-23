function getTimestamp() {
  return new Date().toISOString();
}

function log(level, message, ...args) {
  console.log(`[${getTimestamp()}] [${level.toUpperCase()}] ${message}`, ...args);
}

const logger = {
  info: (message, ...args) => log('info', message, ...args),
  warn: (message, ...args) => log('warn', message, ...args),
  error: (message, ...args) => log('error', message, ...args),
  debug: (message, ...args) => log('debug', message, ...args),
};

module.exports = logger;
