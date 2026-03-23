/**
 * Maps stored banner `slot` (banner type) to home feed placement.
 * App pixel heights are unchanged: hero lane → hero carousel component; mid lane → mid carousel.
 *
 * - hero, large, info → top hero lane (full-width carousel area)
 * - small, mid, category → in-feed mid lane (mid-height carousel blocks)
 */
function homeLaneFromSlot(slot) {
  const t = String(slot || '').toLowerCase();
  if (t === 'hero' || t === 'large' || t === 'info') return 'hero';
  if (t === 'small' || t === 'mid' || t === 'category') return 'mid';
  return 'mid';
}

function isHeroLaneSlot(slot) {
  return homeLaneFromSlot(slot) === 'hero';
}

module.exports = { homeLaneFromSlot, isHeroLaneSlot };
