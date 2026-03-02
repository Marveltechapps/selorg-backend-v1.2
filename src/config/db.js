const mongoose = require('mongoose');
const logger = require('../core/utils/logger');

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/selorg-admin-ops';
    const conn = await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    logger.info('MongoDB Connected', {
      host: conn.connection.host,
      database: conn.connection.name,
    });
  } catch (err) {
    logger.error('Database connection error', {
      error: err.message,
      stack: err.stack,
    });
    logger.warn('Server will continue running, but DB features will be unavailable');
    // We don't exit the process here so the server stays alive for other requests
  }
};

function isConnected() {
  return mongoose.connection.readyState === 1;
}

async function waitForConnection(timeoutMs = 10000) {
  if (isConnected()) return;
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (isConnected()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('MongoDB connection timeout'));
      setTimeout(check, 100);
    };
    check();
  });
}

module.exports = connectDB;
module.exports.isConnected = isConnected;
module.exports.waitForConnection = waitForConnection;
module.exports.mongoose = mongoose;
