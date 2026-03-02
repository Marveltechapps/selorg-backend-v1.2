/**
 * Substitute Suggestion Service
 * Suggests similar SKUs when picker marks item "not found" in HHD app.
 * Uses Merch SKU catalog (category, price range) or falls back to HHD Items.
 */
const HHDItem = require('../models/Item.model');

let MerchSKU = null;
try {
  MerchSKU = require('../../merch/models/SKU');
} catch (e) {
  // Merch module may not be available
}

const DEFAULT_LIMIT = 5;
const PRICE_TOLERANCE_PCT = 0.25; // ±25% price range for suggestions

/**
 * Suggest similar SKUs for substitution when original item is not found.
 * @param {Object} params
 * @param {string} params.sku - Original item SKU/itemCode
 * @param {string} [params.orderId] - Order ID (optional, used to get item category from order)
 * @param {string} [params.category] - Item category (optional, used when sku not in catalog)
 * @param {number} [params.limit] - Max suggestions to return (default 5)
 * @returns {Promise<Array<{code:string,name:string,category:string,price:number}>>}
 */
async function suggestSubstitutes({ sku, orderId, category: inputCategory, limit = DEFAULT_LIMIT }) {
  let category = inputCategory;
  let priceRef = null;

  if (orderId && !category) {
    const orderItem = await HHDItem.findOne({ orderId, itemCode: sku }).lean();
    if (orderItem?.category) category = orderItem.category;
  }

  if (MerchSKU) {
    const original = await MerchSKU.findOne({ code: sku }).lean();
    if (original) {
      category = category || original.category;
      priceRef = original.sellingPrice ?? original.basePrice ?? 0;
    }
  }

  const suggestions = [];

  if (MerchSKU) {
    const query = { code: { $ne: sku } };
    if (category) query.category = category;

    let skus = await MerchSKU.find(query)
      .select('code name category sellingPrice basePrice')
      .lean();

    const price = (s) => s.sellingPrice ?? s.basePrice ?? 0;
    if (priceRef > 0) {
      const low = priceRef * (1 - PRICE_TOLERANCE_PCT);
      const high = priceRef * (1 + PRICE_TOLERANCE_PCT);
      skus = skus.filter((s) => {
        const p = price(s);
        return p >= low && p <= high;
      });
      skus.sort((a, b) => Math.abs(price(a) - priceRef) - Math.abs(price(b) - priceRef));
    }

    skus.slice(0, limit).forEach((s) => {
      suggestions.push({
        code: s.code,
        name: s.name,
        category: s.category || category,
        price: price(s),
      });
    });
  }

  if (suggestions.length === 0 && category) {
    const hhdItems = await HHDItem.find({
      itemCode: { $ne: sku },
      category,
    })
      .limit(limit)
      .lean();

    const seen = new Set();
    hhdItems.forEach((i) => {
      if (!seen.has(i.itemCode)) {
        seen.add(i.itemCode);
        suggestions.push({
          code: i.itemCode,
          name: i.name,
          category: i.category,
          price: null,
        });
      }
    });
  }

  return suggestions;
}

module.exports = { suggestSubstitutes };
