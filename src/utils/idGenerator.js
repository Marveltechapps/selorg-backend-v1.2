const crypto = require('crypto');

/**
 * Generates a short unique identifier for domain entities (transfer IDs, rule IDs, etc.).
 * @param {string} [prefix]
 * @returns {string}
 */
function generateId(prefix = '') {
  const id = crypto.randomBytes(8).toString('hex');
  return prefix ? `${prefix}_${id}` : id;
}

module.exports = { generateId };
