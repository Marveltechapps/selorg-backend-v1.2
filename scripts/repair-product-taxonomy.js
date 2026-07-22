/**
 * Full-catalog product taxonomy audit + repair.
 *
 * Root cause being repaired: the Master Sheet importer used to run fuzzy
 * SUBSTRING name matching BEFORE hierarchy-code matching, so SKUs like
 * "Lemon Rice Masala" (substring-matched the L3 leaf "Lemon") were written
 * with a wrong categoryId/subcategoryId (Fruits → Native Fruits).
 *
 * Complications found during the audit, which the rules below handle:
 *  - The Master Sheet REUSES hierarchy codes across unrelated products
 *    (e.g. A1001 is on both "Almonds" and "Corn - 250g"), so codes cannot be
 *    applied blindly either.
 *  - Some codes on products are orphans (no Categories-sheet leaf owns them,
 *    e.g. A3519 for JackFruit Flour).
 *  - Repeated imports left duplicate/superseded category docs.
 *
 * Decision rules per product (strongest signal first):
 *  1. hierarchy code resolves to a leaf whose name EXACTLY matches the
 *     product name (sizes stripped)                    → code target wins.
 *  2. a UNIQUE L3 leaf name exactly matches the product name
 *                                                      → that leaf's chain wins.
 *  3. stored taxonomy missing/invalid and code resolves → code target wins.
 *  4. stored taxonomy VALID but carries the substring-bug signature (a leaf
 *     under the stored subcategory is a proper substring of the product name,
 *     with no exact-name leaf there) → code target wins ONLY when trustworthy:
 *       - the code is attached directly to an L2/L1 node (deliberate ops
 *         mapping), or
 *       - cohort consensus: ≥2 other distinct product lines share the same
 *         code with valid, untainted taxonomy that AGREES with the code
 *         target (rules out one-off code collisions like Cabbage vs Figs).
 *  5. code unresolvable but stored is bug-tainted/invalid → unique nearest
 *     owned code in the same Axx00 bucket (e.g. A3519 → A3518 = ATTA & Flour).
 *  6. stale-alias remap: stored ids point at inactive/superseded category
 *     docs → remapped to the active doc with the same slug/name.
 *  7. line consistency: SKUs of the same product line (same size-stripped
 *     name) are forced to one target — weaker signals defer to stronger ones,
 *     and weak moves are cancelled when a sibling keeps a valid placement.
 *  8. anything else is KEPT and REPORTED — never silently reassigned.
 *
 * Afterwards, duplicate EMPTY active level-2 subcategories (same parent +
 * same normalized name as a populated twin, zero linked products, no real
 * hierarchy codes) are deactivated (not deleted) to unclutter the UI.
 *
 * Only `categoryId` / `subcategoryId` on products (and `isActive` on those
 * duplicate empty L2 docs) are written. Products are never created/deleted;
 * images, prices, stock, reviews, SEO and ids are untouched.
 *
 * Usage (from selorg-backend-v1.2/):
 *   node scripts/repair-product-taxonomy.js               # dry run + report
 *   node scripts/repair-product-taxonomy.js --apply       # write repairs
 *   node scripts/repair-product-taxonomy.js --report out.json
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { Category } = require('../src/customer-backend/models/Category');
const { Product } = require('../src/customer-backend/models/Product');

const APPLY = process.argv.includes('--apply');
const reportArgIdx = process.argv.indexOf('--report');
const REPORT_PATH =
  reportArgIdx !== -1 && process.argv[reportArgIdx + 1]
    ? process.argv[reportArgIdx + 1]
    : path.join(__dirname, `taxonomy-repair-report-${APPLY ? 'apply' : 'dry-run'}.json`);

const compactCode = (s) => String(s || '').trim().replace(/\s+/g, '').toUpperCase();
const normPlain = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');

/** Mirrors normalizeForMatch in contentHubMasterImport.service.js. */
function normalizeForMatch(str) {
  const s = String(str || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[-—–]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ');
  return s.trim().replace(/([a-z])\1+/g, '$1');
}

/** Mirrors getSkuBaseName in contentHubMasterImport.service.js. */
function getSkuBaseName(skuName) {
  const raw = String(skuName || '').trim();
  if (!raw) return '';
  const parts = raw.split('-').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[0];
  const parts2 = raw.split('—').map((p) => p.trim()).filter(Boolean);
  if (parts2.length >= 2) return parts2[0];
  return raw;
}

/** Trailing size/pack tokens that are not part of the product identity. */
const SIZE_TOKEN = /^(\d+([a-z]*)?|g|gm|gms|kg|ml|l|ltr|pc|pcs|piece|pieces|pack|multipack|combo|aprox|approx|x)$/;
function stripSizeTokens(normalizedName) {
  const tokens = normalizedName.split(' ').filter(Boolean);
  while (tokens.length > 1 && SIZE_TOKEN.test(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(' ');
}

function productNameVariants(name) {
  const fullNorm = normalizeForMatch(name);
  const variants = [];
  const stripped = stripSizeTokens(fullNorm);
  if (stripped) variants.push(stripped);
  const baseNorm = normalizeForMatch(getSkuBaseName(name));
  if (baseNorm && !variants.includes(baseNorm)) variants.push(baseNorm);
  if (fullNorm && !variants.includes(fullNorm)) variants.push(fullNorm);
  return variants;
}

function parseHierarchyCode(code) {
  const raw = String(code || '').trim();
  const m = /^([A-Za-z])\s*(\d+)$/.exec(raw);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const digitsStr = m[2];
  const width = digitsStr.length;
  const num = Number.parseInt(digitsStr, 10);
  if (!Number.isFinite(num)) return null;
  const pad = (n) => String(n).padStart(width, '0');
  return {
    letter,
    num,
    width,
    mainCode: `${letter}${pad(Math.floor(num / 1000) * 1000)}`,
    subCode: `${letter}${pad(Math.floor(num / 100) * 100)}`,
  };
}

(async () => {
  await connectDB();
  console.log(APPLY ? '=== APPLY MODE ===' : '=== DRY RUN (no writes) ===');

  // ---------- Load category tree ----------
  const allCategories = await Category.find({}).lean();
  const catById = new Map(allCategories.map((c) => [String(c._id), c]));
  const activeCats = allCategories.filter((c) => c.isActive);
  const activeL1 = activeCats.filter((c) => c.level === 1);
  const activeL2 = activeCats.filter((c) => c.level === 2);
  const activeL3 = activeCats.filter((c) => c.level === 3);

  const activeL1BySlug = new Map(activeL1.map((c) => [c.slug, c]));
  const activeL2ByParentAndName = new Map();
  for (const c of activeL2) {
    activeL2ByParentAndName.set(`${String(c.parentId)}::${normPlain(c.name)}`, c);
  }

  /** L3 leaf → { catId, subId } via active parents; null when chain broken. */
  const leafChain = (leaf) => {
    const sub = catById.get(String(leaf.parentId));
    if (!sub || !sub.isActive || sub.level !== 2 || !sub.parentId) return null;
    const main = catById.get(String(sub.parentId));
    if (!main || !main.isActive || main.level !== 1) return null;
    return { catId: String(main._id), subId: String(sub._id) };
  };

  // code (compact) → targets; L3 leaf-name → chain targets; leaves per chain.
  const codeTargets = new Map();
  const addTarget = (code, target) => {
    const key = compactCode(code);
    if (!key || key.startsWith('__SHEET')) return;
    if (!codeTargets.has(key)) codeTargets.set(key, []);
    codeTargets.get(key).push(target);
  };
  const leafNameTargets = new Map(); // normName -> Map(chainKey -> target)
  const leavesByChain = new Map(); // chainKey -> [normName]
  for (const c of activeCats) {
    if (c.level === 3 && c.parentId) {
      const chain = leafChain(c);
      if (chain) {
        const chainKey = `${chain.catId}::${chain.subId}`;
        const ln = normalizeForMatch(c.name);
        if (!leafNameTargets.has(ln)) leafNameTargets.set(ln, new Map());
        leafNameTargets.get(ln).set(chainKey, { ...chain, leafName: c.name });
        if (!leavesByChain.has(chainKey)) leavesByChain.set(chainKey, []);
        leavesByChain.get(chainKey).push(ln);
        for (const code of c.hierarchyCodes || []) {
          if (String(code).startsWith('__sheet/')) continue;
          addTarget(code, { ...chain, leafName: c.name, via: `L3:${c.name}` });
        }
      }
    } else if (c.level === 2 && c.parentId) {
      const main = catById.get(String(c.parentId));
      if (main && main.isActive) {
        for (const code of c.hierarchyCodes || []) {
          if (String(code).startsWith('__sheet/')) continue;
          addTarget(code, { catId: String(main._id), subId: String(c._id), via: `L2:${c.name}` });
        }
      }
    } else if (c.level === 1) {
      for (const code of c.hierarchyCodes || []) {
        if (String(code).startsWith('__sheet/')) continue;
        addTarget(code, { catId: String(c._id), subId: null, via: `L1:${c.name}` });
      }
    }
  }

  // Owned numeric codes for bucket inference (only unambiguous owners).
  const ownedNumericCodes = [];
  for (const [key, targets] of codeTargets.entries()) {
    const hc = parseHierarchyCode(key);
    if (!hc) continue;
    const distinct = new Map();
    for (const t of targets) distinct.set(`${t.catId}::${t.subId}`, t);
    if (distinct.size === 1) {
      ownedNumericCodes.push({
        letter: hc.letter,
        num: hc.num,
        bucket: Math.floor(hc.num / 100),
        target: targets[0],
        code: key,
      });
    }
  }

  const resolveCode = (codeKey) => {
    const targets = codeTargets.get(codeKey);
    if (!targets || targets.length === 0) return { target: null, ambiguous: false };
    const distinct = new Map();
    for (const t of targets) distinct.set(`${t.catId}::${t.subId}`, t);
    if (distinct.size === 1) return { target: targets[0], ambiguous: false };
    const cats = new Set([...distinct.values()].map((t) => t.catId));
    if (cats.size === 1) {
      const withSub = [...distinct.values()].filter((t) => t.subId);
      if (withSub.length === 1) return { target: withSub[0], ambiguous: false };
    }
    return { target: null, ambiguous: true };
  };

  const resolveHierarchy = (rawCode) => {
    const key = compactCode(rawCode);
    if (!key) return { target: null, ambiguous: false };
    let res = resolveCode(key);
    if (res.target || res.ambiguous) return res;
    const hc = parseHierarchyCode(rawCode);
    if (hc) {
      for (const fallback of [hc.subCode, hc.mainCode]) {
        const fkey = compactCode(fallback);
        if (fkey === key) continue;
        res = resolveCode(fkey);
        if (res.target || res.ambiguous) return res;
      }
    }
    return { target: null, ambiguous: false };
  };

  /** Unique nearest owned code within the same letter + Axx00 bucket. */
  const bucketInference = (rawCode) => {
    const hc = parseHierarchyCode(rawCode);
    if (!hc) return null;
    const bucket = Math.floor(hc.num / 100);
    const candidates = ownedNumericCodes.filter((c) => c.letter === hc.letter && c.bucket === bucket);
    if (candidates.length === 0) return null;
    let best = null;
    let bestDist = Infinity;
    let tie = false;
    for (const c of candidates) {
      const d = Math.abs(c.num - hc.num);
      if (d < bestDist) {
        best = c;
        bestDist = d;
        tie = false;
      } else if (
        d === bestDist &&
        `${c.target.catId}::${c.target.subId}` !== `${best.target.catId}::${best.target.subId}`
      ) {
        tie = true;
      }
    }
    if (!best || tie) return null;
    return { target: best.target, nearestCode: best.code };
  };

  const describe = (catId, subId) => {
    const cat = catId ? catById.get(String(catId)) : null;
    const sub = subId ? catById.get(String(subId)) : null;
    return {
      categoryId: catId ? String(catId) : null,
      categoryName: cat ? cat.name : null,
      subcategoryId: subId ? String(subId) : null,
      subcategoryName: sub ? sub.name : null,
    };
  };

  // ---------- Hierarchy code health (report) ----------
  const duplicateCodes = [];
  for (const [code, targets] of codeTargets.entries()) {
    const distinct = new Map();
    for (const t of targets) distinct.set(`${t.catId}::${t.subId}`, t);
    if (distinct.size > 1) {
      duplicateCodes.push({
        code,
        targets: [...distinct.values()].map((t) => ({ via: t.via, ...describe(t.catId, t.subId) })),
      });
    }
  }

  // ---------- Scan every product ----------
  const products = await Product.find({})
    .select('_id sku name classification hierarchyCode categoryId subcategoryId isActive')
    .lean();

  // Pass A: gather facts per product.
  const facts = [];
  for (const p of products) {
    const storedCat = p.categoryId ? String(p.categoryId) : null;
    const storedSub = p.subcategoryId ? String(p.subcategoryId) : null;
    const rawCode = String(p.hierarchyCode || '').trim();

    const storedCatDoc = storedCat ? catById.get(storedCat) : null;
    const storedSubDoc = storedSub ? catById.get(storedSub) : null;
    const storedValid = Boolean(
      storedCatDoc &&
        storedCatDoc.isActive &&
        storedCatDoc.level === 1 &&
        storedSubDoc &&
        storedSubDoc.isActive &&
        storedSubDoc.level === 2 &&
        String(storedSubDoc.parentId) === storedCat
    );

    const nameVariants = productNameVariants(p.name);
    const lineKey = nameVariants[0] || normalizeForMatch(p.name);

    // Exact leaf-name target (unique chain across the whole tree).
    let exactTarget = null;
    for (const v of nameVariants) {
      const chains = leafNameTargets.get(v);
      if (chains && chains.size === 1) {
        exactTarget = [...chains.values()][0];
        break;
      }
      if (chains && chains.size > 1) break; // ambiguous name — leave to code
    }

    // Substring-bug signature: a leaf under the STORED subcategory is a proper
    // substring of the product name (classic short-leaf-in-long-name bug),
    // with no exact-name leaf there to legitimise the placement.
    let tainted = false;
    if (storedValid) {
      const leaves = leavesByChain.get(`${storedCat}::${storedSub}`) || [];
      const exactHere = leaves.some((l) => nameVariants.includes(l));
      if (!exactHere) {
        tainted = leaves.some((l) => {
          if (!l || l.length < 3) return false;
          return nameVariants.some((v) => v !== l && v.includes(l));
        });
      }
    }

    // Hierarchy resolution.
    let codeTarget = null;
    let codeAmbiguous = false;
    let codeLeafExact = false;
    if (rawCode) {
      const res = resolveHierarchy(rawCode);
      codeAmbiguous = res.ambiguous;
      if (res.target) {
        codeTarget = res.target;
        codeLeafExact = Boolean(
          res.target.leafName && nameVariants.includes(normalizeForMatch(res.target.leafName))
        );
      }
    }

    facts.push({
      p,
      storedCat,
      storedSub,
      storedCatDoc,
      storedSubDoc,
      storedValid,
      tainted,
      nameVariants,
      lineKey,
      rawCode,
      codeKey: compactCode(rawCode),
      codeTarget,
      codeAmbiguous,
      codeLeafExact,
      exactTarget,
    });
  }

  // Pass B: cohort consensus. For each code, which chains do products with
  // VALID + UNTAINTED stored taxonomy live in (counted by product line)?
  const cohortByCode = new Map(); // codeKey -> Map(chainKey -> Set(lineKey))
  for (const f of facts) {
    if (!f.codeKey || !f.storedValid || f.tainted) continue;
    const chainKey = `${f.storedCat}::${f.storedSub}`;
    if (!cohortByCode.has(f.codeKey)) cohortByCode.set(f.codeKey, new Map());
    const m = cohortByCode.get(f.codeKey);
    if (!m.has(chainKey)) m.set(chainKey, new Set());
    m.get(chainKey).add(f.lineKey);
  }
  const codeConsensusAgrees = (f) => {
    if (!f.codeTarget) return false;
    const chainKey = `${f.codeTarget.catId}::${f.codeTarget.subId}`;
    const lines = cohortByCode.get(f.codeKey)?.get(chainKey);
    if (!lines) return false;
    const others = [...lines].filter((l) => l !== f.lineKey);
    return others.length >= 2;
  };
  // A code attached directly to an L2/L1 node (or resolved via its Axx00/Ax000
  // bucket) is a deliberate ops-level mapping, not a leaf collision.
  const codeIsStructural = (f) =>
    Boolean(f.codeTarget && !String(f.codeTarget.via || '').startsWith('L3:'));

  // Pass C: per-product decision.
  const STRENGTH = {
    'hierarchy-code-exact-leaf': 5,
    'exact-leaf-name': 4,
    'exact-leaf-name(code-disagrees)': 4,
    'hierarchy-code': 3,
    'hierarchy-code-detainted': 3,
    'stale-alias-remap': 2,
    'stale-sub-remap': 2,
    'consistency:categoryId-was-subcategory': 2,
    'consistency:parent-of-subcategory': 2,
  };
  const strengthOf = (reason) => STRENGTH[reason] ?? (String(reason).startsWith('bucket-inferred') ? 1 : 0);

  const keptConflicts = [];
  const unresolved = [];
  const ambiguousProducts = [];
  const missingCode = [];

  for (const f of facts) {
    const { p, storedCat, storedSub, rawCode } = f;
    f.status = 'keep';
    f.expected = null;
    f.reason = null;

    if (!rawCode) {
      missingCode.push({ sku: p.sku, name: p.name, stored: describe(storedCat, storedSub) });
    }

    const sameAsStored = (t) => t && t.catId === storedCat && (t.subId || null) === storedSub;

    if (f.codeAmbiguous && !f.exactTarget) {
      ambiguousProducts.push({
        sku: p.sku,
        name: p.name,
        hierarchyCode: rawCode,
        stored: describe(storedCat, storedSub),
      });
      f.status = 'ambiguous';
      continue;
    }

    let expected = null;
    let reason = null;

    if (f.codeTarget && f.codeLeafExact) {
      // Code's own leaf carries this exact product name — strongest signal.
      expected = f.codeTarget;
      reason = 'hierarchy-code-exact-leaf';
    } else if (f.exactTarget) {
      // A unique leaf elsewhere carries the exact product name.
      expected = f.exactTarget;
      reason =
        f.codeTarget &&
        !sameAsStored(f.codeTarget) &&
        `${f.codeTarget.catId}::${f.codeTarget.subId}` !== `${f.exactTarget.catId}::${f.exactTarget.subId}`
          ? 'exact-leaf-name(code-disagrees)'
          : 'exact-leaf-name';
    } else if (f.codeTarget) {
      if (sameAsStored(f.codeTarget)) {
        f.status = 'correct';
        continue;
      }
      if (f.storedValid && !f.tainted) {
        f.status = 'kept';
        keptConflicts.push({
          sku: p.sku,
          name: p.name,
          hierarchyCode: rawCode,
          stored: describe(storedCat, storedSub),
          codeTarget: describe(f.codeTarget.catId, f.codeTarget.subId),
          note: 'reused/duplicate sheet code — stored taxonomy kept',
        });
        continue;
      }
      if (f.storedValid && f.tainted) {
        // Tainted placement: only trust the code when it is a structural
        // mapping or a cohort of untainted products confirms the same target.
        if (codeIsStructural(f) || codeConsensusAgrees(f)) {
          expected = f.codeTarget;
          reason = 'hierarchy-code-detainted';
        } else {
          f.status = 'kept';
          keptConflicts.push({
            sku: p.sku,
            name: p.name,
            hierarchyCode: rawCode,
            stored: describe(storedCat, storedSub),
            codeTarget: describe(f.codeTarget.catId, f.codeTarget.subId),
            note: 'tainted stored taxonomy but code target unconfirmed (possible leaf collision) — kept',
          });
          continue;
        }
      } else {
        expected = f.codeTarget;
        reason = 'hierarchy-code';
      }
    } else if (rawCode && (f.tainted || !f.storedValid)) {
      const inf = bucketInference(rawCode);
      if (inf) {
        expected = inf.target;
        reason = `bucket-inferred(nearest=${inf.nearestCode})`;
      }
    }

    if (!expected && !f.storedValid) {
      // Stale-alias remaps (superseded category docs after re-imports).
      const { storedCatDoc, storedSubDoc } = f;
      if (storedCatDoc && storedCatDoc.level === 2) {
        const parent = catById.get(String(storedCatDoc.parentId));
        if (parent && parent.isActive && storedCatDoc.isActive) {
          expected = { catId: String(parent._id), subId: String(storedCatDoc._id) };
          reason = 'consistency:categoryId-was-subcategory';
        }
      } else if (storedCatDoc && storedCatDoc.level === 1 && !storedCatDoc.isActive) {
        const activeMain = activeL1BySlug.get(storedCatDoc.slug);
        if (activeMain) {
          const mappedSub = storedSubDoc
            ? activeL2ByParentAndName.get(`${String(activeMain._id)}::${normPlain(storedSubDoc.name)}`) || null
            : null;
          expected = { catId: String(activeMain._id), subId: mappedSub ? String(mappedSub._id) : null };
          reason = 'stale-alias-remap';
        }
      } else if (storedCatDoc && storedCatDoc.isActive && storedSubDoc) {
        if (!storedSubDoc.isActive && storedSubDoc.level === 2) {
          const mappedSub = activeL2ByParentAndName.get(`${storedCat}::${normPlain(storedSubDoc.name)}`) || null;
          if (mappedSub) {
            expected = { catId: storedCat, subId: String(mappedSub._id) };
            reason = 'stale-sub-remap';
          }
        } else if (
          storedSubDoc.isActive &&
          storedSubDoc.level === 2 &&
          String(storedSubDoc.parentId) !== storedCat
        ) {
          const parent = catById.get(String(storedSubDoc.parentId));
          if (parent && parent.isActive) {
            expected = { catId: String(parent._id), subId: storedSub };
            reason = 'consistency:parent-of-subcategory';
          }
        }
      }
    }

    if (!expected) {
      if (f.tainted || (!f.storedValid && rawCode)) {
        unresolved.push({
          sku: p.sku,
          name: p.name,
          hierarchyCode: rawCode || null,
          stored: describe(storedCat, storedSub),
          note: f.tainted
            ? 'bug-tainted stored taxonomy, no reliable signal'
            : 'invalid stored taxonomy, code unresolvable',
        });
        f.status = 'unresolved';
      }
      continue;
    }

    if (sameAsStored(expected)) {
      f.status = 'correct';
      continue;
    }

    f.status = 'move';
    f.expected = expected;
    f.reason = reason;
  }

  // Pass D: line consistency. All SKUs of one product line (same size-stripped
  // name) must land in one place; weak signals defer to stronger siblings.
  const byLine = new Map();
  for (const f of facts) {
    if (!byLine.has(f.lineKey)) byLine.set(f.lineKey, []);
    byLine.get(f.lineKey).push(f);
  }
  for (const [, members] of byLine.entries()) {
    const moves = members.filter((m) => m.status === 'move');
    if (moves.length === 0) continue;
    const strongest = moves.reduce((a, b) => (strengthOf(b.reason) > strengthOf(a.reason) ? b : a));
    const strongestStrength = strengthOf(strongest.reason);

    if (strongestStrength >= 4) {
      // Exact-name evidence: align every movable / tainted / invalid sibling.
      for (const m of members) {
        if (m === strongest) continue;
        const movable = m.status === 'move' || (m.status === 'kept' && m.tainted) || (m.status === 'unresolved');
        if (!movable) continue;
        const t = strongest.expected;
        if (t.catId === m.storedCat && (t.subId || null) === m.storedSub) {
          if (m.status === 'move') m.status = 'correct';
          continue;
        }
        m.status = 'move';
        m.expected = t;
        m.reason = `line-align(${strongest.reason})`;
      }
    } else {
      // No strong evidence: if a sibling keeps a valid stored placement,
      // cancel weak bucket-inferred moves and align to the sibling instead.
      const keeper = members.find((m) => (m.status === 'correct' || m.status === 'kept' || m.status === 'keep') && m.storedValid);
      if (!keeper) continue;
      for (const m of moves) {
        if (strengthOf(m.reason) > 1) continue;
        if (keeper.storedCat === m.storedCat && keeper.storedSub === m.storedSub) {
          m.status = 'keep';
          m.expected = null;
          m.reason = null;
        } else {
          m.expected = { catId: keeper.storedCat, subId: keeper.storedSub };
          m.reason = 'line-align(valid-sibling)';
        }
      }
    }
  }

  // Build final change set.
  const changes = [];
  const bulkOps = [];
  for (const f of facts) {
    if (f.status !== 'move' || !f.expected) continue;
    changes.push({
      sku: f.p.sku,
      name: f.p.name,
      classification: f.p.classification,
      hierarchyCode: f.rawCode || null,
      reason: f.reason,
      before: describe(f.storedCat, f.storedSub),
      after: describe(f.expected.catId, f.expected.subId),
    });
    bulkOps.push({
      updateOne: {
        filter: { _id: f.p._id },
        update: {
          $set: {
            categoryId: new mongoose.Types.ObjectId(f.expected.catId),
            subcategoryId: f.expected.subId ? new mongoose.Types.ObjectId(f.expected.subId) : null,
          },
        },
      },
    });
  }

  // ---------- Apply product repairs ----------
  let modified = 0;
  if (APPLY && bulkOps.length > 0) {
    for (let i = 0; i < bulkOps.length; i += 500) {
      // eslint-disable-next-line no-await-in-loop
      const res = await Product.bulkWrite(bulkOps.slice(i, i + 500), { ordered: false });
      modified += res.modifiedCount || 0;
    }
  }

  // ---------- Duplicate empty L2 subcategories (repeat-import leftovers) ----------
  // Computed AFTER product repairs so counts reflect the repaired links.
  const dupL2Deactivations = [];
  {
    const l2ByKey = new Map();
    for (const c of activeL2) {
      const k = `${String(c.parentId)}::${normPlain(c.name)}`;
      if (!l2ByKey.has(k)) l2ByKey.set(k, []);
      l2ByKey.get(k).push(c);
    }
    for (const [, docs] of l2ByKey.entries()) {
      if (docs.length < 2) continue;
      // eslint-disable-next-line no-await-in-loop
      const counts = await Promise.all(
        docs.map((d) => Product.countDocuments({ $or: [{ subcategoryId: d._id }, { categoryId: d._id }] }))
      );
      const keepIdx = counts.indexOf(Math.max(...counts));
      docs.forEach((d, i) => {
        if (i === keepIdx) return;
        if (counts[i] > 0) return; // never hide a populated node
        const realCodes = (d.hierarchyCodes || []).filter((c) => !String(c).startsWith('__sheet/'));
        if (realCodes.length > 0) return; // still referenced by code lookups
        dupL2Deactivations.push({
          _id: String(d._id),
          name: d.name,
          parent: catById.get(String(d.parentId))?.name || null,
          keptTwin: String(docs[keepIdx]._id),
        });
      });
    }
    if (APPLY && dupL2Deactivations.length > 0) {
      await Category.updateMany(
        { _id: { $in: dupL2Deactivations.map((d) => new mongoose.Types.ObjectId(d._id)) } },
        { $set: { isActive: false } }
      );
    }
  }

  // ---------- Report ----------
  const byReason = {};
  for (const c of changes) byReason[c.reason] = (byReason[c.reason] || 0) + 1;

  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    totals: {
      categoriesAudited: allCategories.length,
      activeL1: activeL1.length,
      activeL2: activeL2.length,
      activeL3: activeL3.length,
      productsAudited: products.length,
      productsToRepair: changes.length,
      productsRepaired: APPLY ? modified : 0,
      keptCodeConflicts: keptConflicts.length,
      unresolved: unresolved.length,
      ambiguousCode: ambiguousProducts.length,
      missingCode: missingCode.length,
      duplicateCategoryCodes: duplicateCodes.length,
      duplicateEmptyL2Deactivated: dupL2Deactivations.length,
    },
    changesByReason: byReason,
    changes,
    keptConflicts,
    unresolved,
    ambiguousProducts,
    missingCode,
    duplicateCategoryCodes: duplicateCodes,
    duplicateEmptyL2Deactivations: dupL2Deactivations,
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log('--- Summary ---');
  console.log(JSON.stringify(report.totals, null, 2));
  console.log('Changes by reason:', JSON.stringify(byReason, null, 2));
  console.log(`Report written: ${REPORT_PATH}`);
  if (!APPLY && (changes.length > 0 || dupL2Deactivations.length > 0)) {
    console.log('Dry run only. Re-run with --apply to write repairs.');
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
