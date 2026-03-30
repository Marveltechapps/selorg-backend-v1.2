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

function pickFirstString(...vals) {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function enrichCategory(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const primary = pickFirstString(doc.thumbnailUrl, doc.cardImageUrl, doc.imageUrl);
  return {
    ...doc,
    thumbnailUrl: primary,
    cardImageUrl: pickFirstString(doc.cardImageUrl, doc.thumbnailUrl, doc.imageUrl) || primary,
  };
}

function enrichProduct(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const img0 =
    Array.isArray(doc.images) && doc.images.length > 0 && typeof doc.images[0] === 'string'
      ? doc.images[0].trim()
      : '';
  const primary = pickFirstString(doc.thumbnailUrl, doc.cardImageUrl, doc.imageUrl, img0);
  return {
    ...doc,
    thumbnailUrl: primary,
    cardImageUrl: pickFirstString(doc.cardImageUrl, doc.thumbnailUrl, doc.imageUrl, img0) || primary,
  };
}

function enrichBanner(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const wide = pickFirstString(doc.bannerImageUrl, doc.thumbnailUrl, doc.imageUrl);
  const thumb = pickFirstString(doc.thumbnailUrl, doc.bannerImageUrl, doc.imageUrl);
  return {
    ...doc,
    bannerImageUrl: wide,
    thumbnailUrl: thumb || wide,
  };
}

function enrichLifestyleItem(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const primary = pickFirstString(doc.thumbnailUrl, doc.cardImageUrl, doc.imageUrl);
  return {
    ...doc,
    thumbnailUrl: primary,
    cardImageUrl: pickFirstString(doc.cardImageUrl, doc.thumbnailUrl, doc.imageUrl) || primary,
  };
}

function enrichPromoBlockEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const wide = pickFirstString(entry.bannerImageUrl, entry.thumbnailUrl, entry.imageUrl);
  return {
    ...entry,
    bannerImageUrl: wide,
    thumbnailUrl: pickFirstString(entry.thumbnailUrl, entry.bannerImageUrl, entry.imageUrl) || wide,
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
};
