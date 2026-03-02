/**
 * Picker uses the dashboard MongoDB connection.
 * Server calls connectDB() once; this module exposes isDbConnected and mongoose.
 */
const db = require('../../config/db');

function isDbConnected() {
  return db.isConnected && db.isConnected();
}

function connectDB() {
  return Promise.resolve();
}

module.exports = {
  connectDB,
  isDbConnected,
  mongoose: db.mongoose || require('mongoose'),
};
