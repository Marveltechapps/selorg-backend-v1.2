/**
 * Customer app / bootstrap image contract
 *
 * The mobile app prefers smaller display URLs when present (see customer-app productImage.ts):
 * - Categories & products: thumbnailUrl → cardImageUrl → imageUrl → images[0]
 * - Banners: bannerImageUrl → thumbnailUrl → imageUrl
 *
 * When the database only has imageUrl (or images[]), we duplicate into these keys so the
 * contract is stable. When you add real optimized assets in admin, set thumbnailUrl /
 * cardImageUrl / bannerImageUrl and they will be used first.
 */

const { isStubImageUrl, pickFirstNonStubString, sanitizeImageFields } = require('./mediaUrl');

function pickFirstString(...vals) {
  return pickFirstNonStubString(...vals);
}

function enrichCategory(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const base = sanitizeImageFields(doc);
  const primary = pickFirstString(base.thumbnailUrl, base.cardImageUrl, base.imageUrl);
  return {
    ...base,
    thumbnailUrl: primary,
    cardImageUrl: pickFirstString(base.cardImageUrl, base.thumbnailUrl, base.imageUrl) || primary,
  };
}

function enrichProduct(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const base = sanitizeImageFields(doc);
  const img0 =
    Array.isArray(base.images) && base.images.length > 0 && typeof base.images[0] === 'string'
      ? base.images[0].trim()
      : '';
  const primary = pickFirstString(base.thumbnailUrl, base.cardImageUrl, base.imageUrl, img0);
  return {
    ...base,
    thumbnailUrl: primary,
    cardImageUrl: pickFirstString(base.cardImageUrl, base.thumbnailUrl, base.imageUrl, img0) || primary,
    imageUrl: isStubImageUrl(base.imageUrl) ? '' : base.imageUrl,
  };
}

function enrichBanner(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const base = sanitizeImageFields(doc);
  const wide = pickFirstString(base.bannerImageUrl, base.thumbnailUrl, base.imageUrl);
  const thumb = pickFirstString(base.thumbnailUrl, base.bannerImageUrl, base.imageUrl);
  return {
    ...base,
    bannerImageUrl: wide,
    thumbnailUrl: thumb || wide,
  };
}

function enrichLifestyleItem(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const base = sanitizeImageFields(doc);
  const primary = pickFirstString(base.thumbnailUrl, base.cardImageUrl, base.imageUrl);
  return {
    ...base,
    thumbnailUrl: primary,
    cardImageUrl: pickFirstString(base.cardImageUrl, base.thumbnailUrl, base.imageUrl) || primary,
  };
}

function enrichPromoBlockEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const base = sanitizeImageFields(entry);
  const wide = pickFirstString(base.bannerImageUrl, base.thumbnailUrl, base.imageUrl);
  return {
    ...base,
    bannerImageUrl: wide,
    thumbnailUrl: pickFirstString(base.thumbnailUrl, base.bannerImageUrl, base.imageUrl) || wide,
  };
}

function mapArray(arr, fn) {
  if (!Array.isArray(arr)) return arr;
  return arr.map((x) => fn(x));
}

function enrichHomePayloadLegacy(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const out = { ...payload };

  out.categories = mapArray(out.categories, enrichCategory);

  out.heroBanners = mapArray(out.heroBanners, enrichBanner);
  out.midBanners = mapArray(out.midBanners, enrichBanner);

  if (out.bannersByKey && typeof out.bannersByKey === 'object') {
    const next = {};
    for (const [k, list] of Object.entries(out.bannersByKey)) {
      next[k] = mapArray(list, enrichBanner);
    }
    out.bannersByKey = next;
  }

  if (out.sections && typeof out.sections === 'object') {
    const next = {};
    for (const [k, sec] of Object.entries(out.sections)) {
      if (sec && typeof sec === 'object' && Array.isArray(sec.products)) {
        next[k] = { ...sec, products: mapArray(sec.products, enrichProduct) };
      } else {
        next[k] = sec;
      }
    }
    out.sections = next;
  }

  out.lifestyle = mapArray(out.lifestyle, enrichLifestyleItem);

  if (out.promoBlocks && typeof out.promoBlocks === 'object') {
    const next = {};
    for (const [k, v] of Object.entries(out.promoBlocks)) {
      next[k] = enrichPromoBlockEntry(v);
    }
    out.promoBlocks = next;
  }

  if (out.categoryByKey && typeof out.categoryByKey === 'object') {
    const next = {};
    for (const [k, list] of Object.entries(out.categoryByKey)) {
      next[k] = mapArray(list, enrichCategory);
    }
    out.categoryByKey = next;
  }

  return out;
}

function enrichCmsBlockData(type, data) {
  if (!data || typeof data !== 'object') return data;
  const d = { ...data };
  if (type === 'categoryGrid') {
    d.categories = mapArray(d.categories, enrichCategory);
  } else if (type === 'heroBanner' || type === 'bannerCarousel') {
    d.banners = mapArray(d.banners, enrichBanner);
  } else if (type === 'productCarousel' || type === 'collectionCarousel') {
    d.products = mapArray(d.products, enrichProduct);
  } else if (type === 'lifestyleGrid') {
    d.items = mapArray(d.items, enrichLifestyleItem);
  } else if (type === 'promoImage' && d.promoBlocks && typeof d.promoBlocks === 'object') {
    const next = {};
    for (const [k, v] of Object.entries(d.promoBlocks)) {
      next[k] = enrichPromoBlockEntry(v);
    }
    d.promoBlocks = next;
  }
  return d;
}

module.exports = {
  enrichHomePayloadLegacy,
  enrichCmsBlockData,
  enrichCategory,
  enrichProduct,
  enrichBanner,
  isStubImageUrl,
};
