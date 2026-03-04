/**
 * Shared constants for CMS - used by backend, dashboard, and app.
 */

/** Block types for PageBlock - add new types here when extending CMS */
const BLOCK_TYPES = [
  'heroBanner',
  'bannerCarousel',
  'categoryGrid',
  'productCarousel',
  'collectionCarousel',
  'promoImage',
  'videoBlock',
  'lifestyleGrid',
  'textBanner',
  'organicTagline',
];

/** Redirect types for Banner - typed navigation instead of string parsing */
const REDIRECT_TYPES = ['product', 'category', 'collection', 'page', 'url', 'screen'];

const BLOCK_TYPES_SET = new Set(BLOCK_TYPES);
const REDIRECT_TYPES_SET = new Set(REDIRECT_TYPES);

function isValidBlockType(type) {
  return typeof type === 'string' && BLOCK_TYPES_SET.has(type);
}

function isValidRedirectType(type) {
  return typeof type === 'string' && REDIRECT_TYPES_SET.has(type);
}

module.exports = {
  BLOCK_TYPES,
  REDIRECT_TYPES,
  BLOCK_TYPES_SET,
  REDIRECT_TYPES_SET,
  isValidBlockType,
  isValidRedirectType,
};
