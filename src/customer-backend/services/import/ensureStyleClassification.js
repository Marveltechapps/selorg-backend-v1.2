const { Product } = require('../../models/Product');
const { productBaseName } = require('../../utils/productVariantsPayload');

/**
 * Customer list/search endpoints only return `classification: 'Style'` documents; variants are
 * attached to their Style card. Mastersheets sometimes mark every pack size of a product line as
 * "Varient" (no Style row), which makes the whole line invisible in the web app.
 *
 * For every active+saleable product line (hierarchyCode + normalized base name) that has no
 * Style document, promote the cheapest SKU to Style so the line renders as a card with variants.
 *
 * @param {{ session?: import('mongoose').ClientSession, warnings?: Array<object> }} [options]
 * @returns {Promise<number>} number of documents promoted to Style
 */
async function promoteStyleForVariantOnlyGroups({ session = null, warnings = [] } = {}) {
  const q = Product.find({
    isActive: true,
    isSaleable: true,
    hierarchyCode: { $exists: true, $ne: '' },
  }).select('_id sku name price classification hierarchyCode');
  if (session) q.session(session);
  const docs = await q.lean();

  // Group by hierarchyCode + base name: a code can host multiple product lines
  // (e.g. Olive Oil and Moringa Oil sharing one code).
  const lines = new Map();
  for (const d of docs) {
    const key = `${String(d.hierarchyCode).trim()}::${productBaseName(d.name)}`;
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push(d);
  }

  const promoteIds = [];
  for (const [key, group] of lines) {
    if (group.some((d) => d.classification === 'Style')) continue;
    const winner = [...group].sort(
      (a, b) => (Number(a.price) || 0) - (Number(b.price) || 0) || String(a.sku).localeCompare(String(b.sku))
    )[0];
    promoteIds.push(winner._id);
    warnings.push({
      sheet: 'SKU Master',
      sku: winner.sku,
      message: `Product line "${key}" had no Style SKU; promoted ${winner.sku} to Style so it is visible in the shop.`,
    });
  }

  if (promoteIds.length > 0) {
    const upd = Product.updateMany({ _id: { $in: promoteIds } }, { $set: { classification: 'Style' } });
    if (session) upd.session(session);
    await upd;
  }
  return promoteIds.length;
}

module.exports = { promoteStyleForVariantOnlyGroups };
