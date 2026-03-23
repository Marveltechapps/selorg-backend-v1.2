const mongoose = require('mongoose');
const { VALID_SECTION_KEYS } = require('./HomeConfig');
const VALID_KEYS_SET = new Set(VALID_SECTION_KEYS);

/** Keys matching these prefixes are allowed for multiple sections of same type */
const KEY_PREFIX_PATTERN = /^(collections|deals|wellbeing|banner_main|banner_sub|banner|section)_[a-zA-Z0-9_-]+$/;

const homeSectionDefinitionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    label: { type: String, default: '' },
    order: { type: Number, default: 0 },
    type: {
      type: String,
      enum: ['super_category', 'banner_main', 'banner_sub', 'banner', 'collections', 'lifestyle', 'tagline', null],
      default: null,
    },
    collectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerCollection', default: null },
    taglineText: { type: String, default: '' },
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CustomerCategory' }],
    bannerId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerBanner', default: null },
    /** Ordered banners for this section (preferred). Falls back to bannerId when empty. */
    bannerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CustomerBanner' }],
    /** single = one banner picker; multiple = N banners in order */
    bannerSelectionMode: { type: String, enum: ['single', 'multiple'], default: 'single' },
    /** For banner slots: when true, app shows carousel; when false, single static banner. Legacy + banner type. */
    useCarousel: { type: Boolean, default: true },
  },
  { timestamps: true }
);

homeSectionDefinitionSchema.index({ order: 1 });
homeSectionDefinitionSchema.index({ type: 1 });

const HomeSectionDefinition =
  mongoose.models.CustomerHomeSectionDefinition ||
  mongoose.model('CustomerHomeSectionDefinition', homeSectionDefinitionSchema, 'customer_home_section_definitions');

function validateKey(key) {
  if (typeof key !== 'string') return false;
  return VALID_KEYS_SET.has(key) || KEY_PREFIX_PATTERN.test(key);
}

module.exports = { HomeSectionDefinition, validateKey };
