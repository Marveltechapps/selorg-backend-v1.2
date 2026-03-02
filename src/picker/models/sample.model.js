/**
 * Sample Mongoose model
 */
const mongoose = require('mongoose');

const sampleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Sample', sampleSchema);
