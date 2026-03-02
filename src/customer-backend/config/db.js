/**
 * Re-export shared DB helpers for customer-backend.
 * Root server.js connects once; customer-backend does not call connectDB().
 */
const connectDB = require('../../config/db');
module.exports = { isConnected: connectDB.isConnected, waitForConnection: connectDB.waitForConnection };
