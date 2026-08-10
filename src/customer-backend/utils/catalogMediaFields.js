/**
 * Shared helpers for Category / SubCategory media fields on API payloads.
 */

function pickCategoryMediaFields(doc = {}) {
  const bannerImage = String(doc.bannerImage || '').trim() || null;
  const bannerVideo = String(doc.bannerVideo || '').trim() || null;
  const youtubeUrl = String(doc.youtubeUrl || '').trim() || null;
  return { bannerImage, bannerVideo, youtubeUrl };
}

/**
 * Master Sheet MaxOrderLimit → API number | null (null = unlimited).
 */
function pickMaxOrderLimit(doc = {}) {
  const raw = doc.maxOrderLimit;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

module.exports = {
  pickCategoryMediaFields,
  pickMaxOrderLimit,
};
