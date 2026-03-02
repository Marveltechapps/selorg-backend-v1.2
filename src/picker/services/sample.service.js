/**
 * Sample service – business logic layer.
 * REAL-TIME: default empty/list fallback if DB slow.
 */
const Sample = require('../models/sample.model');
const { withTimeout, DB_TIMEOUT_MS } = require('../utils/realtime.util');

const getAll = async () => {
  try {
    return await withTimeout(Sample.find().lean(), DB_TIMEOUT_MS, []);
  } catch (err) {
    console.warn('[sample] getAll fallback:', err?.message);
    return [];
  }
};

const getById = async (id) => {
  try {
    return await withTimeout(Sample.findById(id).lean(), DB_TIMEOUT_MS, null);
  } catch (err) {
    console.warn('[sample] getById fallback:', err?.message);
    return null;
  }
};

const create = async (data) => {
  const doc = new Sample(data);
  return doc.save();
};

module.exports = { getAll, getById, create };
