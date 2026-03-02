const mongoose = require('mongoose');

/** Allowlist of section keys that the app can render. Add new keys here when adding new section types in the app. */
const VALID_SECTION_KEYS = [
  'categories', 'hero_banner', 'deals', 'wellbeing', 'greens_banner', 'section_image',
  'lifestyle', 'new_deals', 'mid_banner', 'fresh_juice', 'deals_2', 'organic_tagline',
];
const VALID_SECTION_KEYS_SET = new Set(VALID_SECTION_KEYS);

const DEFAULT_SECTION_DEFINITIONS = VALID_SECTION_KEYS.map((key) => ({
  key,
  label: key.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
}));

const sectionDefinitionSchema = new mongoose.Schema(
  { key: { type: String, required: true }, label: { type: String, default: '' } },
  { _id: false }
);

const homeConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'main', unique: true },
    heroVideoUrl: String,
    searchPlaceholder: String,
    deliveryTypeLabel: String,
    categorySectionTitle: String,
    organicTagline: String,
    organicIconUrl: String,
    sectionOrder: { type: [String], default: [] },
    sectionVisibility: { type: Object, default: {} },
    /** Section keys with display labels for admin UI. Defaults to VALID_SECTION_KEYS with human-readable labels. */
    sectionDefinitions: {
      type: [sectionDefinitionSchema],
      default: DEFAULT_SECTION_DEFINITIONS,
    },
    /** Ordered category IDs to show on home (from catalog). If empty, all top-level categories by order are used. */
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CustomerCategory' }],
  },
  { timestamps: true }
);

/** Validate section keys against allowlist. Use in controller before update. */
function validateSectionKeys(keys) {
  if (!Array.isArray(keys)) return true;
  return keys.every((k) => typeof k === 'string' && VALID_SECTION_KEYS_SET.has(k));
}

function validateSectionDefinitions(defs) {
  if (!Array.isArray(defs)) return true;
  return defs.every((d) => d && typeof d.key === 'string' && VALID_SECTION_KEYS_SET.has(d.key));
}
const HomeConfig = mongoose.models.CustomerHomeConfig || mongoose.model('CustomerHomeConfig', homeConfigSchema, 'customer_home_configs');
module.exports = {
  HomeConfig,
  VALID_SECTION_KEYS,
  DEFAULT_SECTION_DEFINITIONS,
  validateSectionKeys,
  validateSectionDefinitions,
};
