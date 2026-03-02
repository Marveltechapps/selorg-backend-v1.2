const mongoose = require('mongoose');
const { VALID_SECTION_KEYS } = require('./HomeConfig');
const VALID_KEYS_SET = new Set(VALID_SECTION_KEYS);

const homeSectionDefinitionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    label: { type: String, default: '' },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

homeSectionDefinitionSchema.index({ order: 1 });

const HomeSectionDefinition =
  mongoose.models.CustomerHomeSectionDefinition ||
  mongoose.model('CustomerHomeSectionDefinition', homeSectionDefinitionSchema, 'customer_home_section_definitions');

function validateKey(key) {
  return typeof key === 'string' && VALID_KEYS_SET.has(key);
}

module.exports = { HomeSectionDefinition, validateKey };
