/**
 * Live API audit: compares customer catalog endpoints with the DB.
 * Requires backend running on API_BASE (default http://localhost:3333/api/v1/customer).
 */
require('dotenv').config();
const connectDB = require('../src/config/db');
const { Product } = require('../src/customer-backend/models/Product');
const { Category } = require('../src/customer-backend/models/Category');
const { Collection } = require('../src/customer-backend/models/Collection');

const API = process.env.AUDIT_API_BASE || 'http://localhost:3333/api/v1/customer';

async function getJson(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) return { __status: res.status };
  return res.json();
}

(async () => {
  await connectDB();

  const out = { api: API };

  // --- DB expectations ---
  const visibleFilter = { isActive: true, isSaleable: true, classification: 'Style' };
  const dbVisibleStyles = await Product.find(visibleFilter).select('sku name hierarchyCode categoryId subcategoryId').lean();
  const dbL1Active = await Category.find({ level: 1, isActive: true }).select('name slug').lean();
  const dbCollections = await Collection.find({ isActive: true }).select('name slug').lean();

  out.db = {
    visibleStyleProducts: dbVisibleStyles.length,
    activeL1Categories: dbL1Active.length,
    activeCollections: dbCollections.length,
  };

  // --- /categories ---
  const catsRes = await getJson('/categories');
  const apiCats = catsRes.data || [];
  out.categoriesEndpoint = {
    count: apiCats.length,
    names: apiCats.map((c) => c.name),
    missingVsDb: dbL1Active.filter((c) => !apiCats.some((a) => a.slug === c.slug)).map((c) => c.name),
  };

  // --- per-category products (paginate all) ---
  const reachable = new Map(); // productId -> [categorySlug]
  out.categoryProducts = [];
  for (const cat of apiCats) {
    let page = 1;
    let total = 0;
    const ids = new Set();
    let subcats = [];
    for (;;) {
      const r = await getJson(`/categories/${cat.slug}/products?page=${page}&limit=50`);
      const d = r.data || {};
      if (page === 1) subcats = d.subcategories || [];
      const prods = d.products || [];
      for (const p of prods) {
        ids.add(p.id);
        if (!reachable.has(p.id)) reachable.set(p.id, []);
        reachable.get(p.id).push(cat.slug);
      }
      total = d.pagination?.total ?? prods.length;
      if (!d.pagination || page >= d.pagination.totalPages || prods.length === 0) break;
      page += 1;
    }
    out.categoryProducts.push({
      slug: cat.slug,
      apiTotal: total,
      fetched: ids.size,
      subcategories: subcats.map((s) => ({ name: s.name, productCount: s.productCount })),
    });
  }

  // --- which DB-visible styles are NOT reachable via any category ---
  const unreachable = dbVisibleStyles.filter((p) => !reachable.has(String(p._id)));
  out.unreachableViaCategories = {
    count: unreachable.length,
    list: unreachable.map((p) => ({ sku: p.sku, name: p.name, hierarchyCode: p.hierarchyCode })),
  };

  // --- search: can unreachable products be found? sample 5 ---
  out.searchProbe = [];
  for (const p of unreachable.slice(0, 5)) {
    const q = encodeURIComponent(p.name.split(' ').slice(0, 2).join(' '));
    const r = await getJson(`/products/search?q=${q}&limit=50`);
    const items = r.data?.products || r.data || [];
    const found = Array.isArray(items) && items.some((x) => (x.id || x._id) === String(p._id));
    out.searchProbe.push({ name: p.name, foundInSearch: found });
  }

  // --- home payload ---
  const home = await getJson('/home');
  const hd = home.data || {};
  const sectionsRaw = Array.isArray(hd.sections) ? hd.sections : Object.entries(hd.sections || {}).map(([k, v]) => ({ key: k, ...(typeof v === 'object' && v !== null ? v : { value: v }) }));
  out.home = {
    keys: Object.keys(hd),
    categories: (hd.categories || []).length,
    sections: sectionsRaw.map((s) => ({
      key: s.key || s.type,
      title: s.title,
      products: Array.isArray(s.products) ? s.products.length : Array.isArray(s.items) ? s.items.length : null,
    })),
  };

  // --- collections ---
  out.collections = [];
  for (const c of dbCollections) {
    const r = await getJson(`/collections/${c.slug}`);
    const d = r.data || {};
    const prods = d.products || [];
    out.collections.push({ slug: c.slug, status: r.__status || 200, products: prods.length, total: d.pagination?.total });
  }

  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
