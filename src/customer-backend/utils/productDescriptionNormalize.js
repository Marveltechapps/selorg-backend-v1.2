/**
 * Normalize product.description for customer API (legacy string, object, aliases, merged blobs).
 */

function normKey(k) {
  return String(k)
    .toLowerCase()
    .replace(/[_\s-]/g, '');
}

function pickFromObject(obj, candidates) {
  const keys = Object.keys(obj);
  for (let c = 0; c < candidates.length; c += 1) {
    const want = normKey(candidates[c]);
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      if (normKey(k) === want) {
        const v = obj[k];
        if (v != null && String(v).trim()) {
          return String(v).trim();
        }
      }
    }
  }
  return '';
}

function countStructuredFields(d) {
  return [d.about, d.healthBenefits, d.nutrition, d.originOfPlace].filter((s) => s && String(s).trim()).length;
}

function splitDescriptionPlainTextInsensitive(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  const patterns = [
    { key: 'about', prefix: 'About - ' },
    { key: 'nutrition', prefix: 'Nutrition - ' },
    { key: 'originOfPlace', prefix: 'Origin of Place - ' },
    { key: 'healthBenefits', prefix: 'Health Benefits - ' },
    { key: 'originOfPlace', prefix: 'Place of Origin - ' },
  ];

  const lower = trimmed.toLowerCase();
  const findPrefix = (prefix, from) => lower.indexOf(prefix.toLowerCase(), from);

  const out = { about: '', nutrition: '', originOfPlace: '', healthBenefits: '' };

  for (let i = 0; i < patterns.length; i += 1) {
    const current = patterns[i];
    const start = findPrefix(current.prefix, 0);
    if (start === -1) continue;
    const plen = current.prefix.length;
    let end = trimmed.length;
    for (let j = 0; j < patterns.length; j += 1) {
      if (j === i) continue;
      const np = findPrefix(patterns[j].prefix, start + plen);
      if (np !== -1) end = Math.min(end, np);
    }
    const slice = trimmed.slice(start + plen, end).trim();
    const { key } = current;
    if (key === 'originOfPlace') {
      if (slice && !out.originOfPlace) out.originOfPlace = slice;
    } else if (!out[key] || slice.length > (out[key] || '').length) {
      out[key] = slice;
    }
  }

  const any = Object.values(out).some((s) => s.trim());
  if (!any) return null;
  return out;
}

function mergeDbAndSplit(d, split) {
  if (!split) return d;
  if (countStructuredFields(d) >= 2) return d;

  const blob = (d.about || d.raw || '').trim();
  const hasMarkers = /(?:Nutrition|Health Benefits|Origin of Place|Place of Origin)\s*-\s*/i.test(blob);
  if (!hasMarkers) {
    return {
      about: d.about || split.about || '',
      healthBenefits: d.healthBenefits || split.healthBenefits || '',
      nutrition: d.nutrition || split.nutrition || '',
      originOfPlace: d.originOfPlace || split.originOfPlace || '',
      raw: d.raw || blob,
    };
  }

  return {
    about: (split.about || '').trim(),
    healthBenefits: (split.healthBenefits || '').trim() || d.healthBenefits,
    nutrition: (split.nutrition || '').trim() || d.nutrition,
    originOfPlace: (split.originOfPlace || '').trim() || d.originOfPlace,
    raw: d.raw || blob,
  };
}

/**
 * @param {unknown} desc
 * @returns {{ about: string; healthBenefits: string; nutrition: string; originOfPlace: string; raw: string }}
 */
function normalizeDescriptionForClient(desc) {
  let d;
  if (desc == null) {
    d = { about: '', healthBenefits: '', nutrition: '', originOfPlace: '', raw: '' };
  } else if (typeof desc === 'string') {
    const s = desc.trim();
    d = { about: s, healthBenefits: '', nutrition: '', originOfPlace: '', raw: s };
  } else if (typeof desc === 'object' && !Array.isArray(desc)) {
    const o = desc;
    d = {
      about: pickFromObject(o, ['about', 'About']) || String(o.about ?? '').trim(),
      healthBenefits:
        pickFromObject(o, ['healthBenefits', 'health_benefits', 'Health Benefits']) ||
        String(o.healthBenefits ?? '').trim(),
      nutrition: pickFromObject(o, ['nutrition', 'Nutrition']) || String(o.nutrition ?? '').trim(),
      originOfPlace:
        pickFromObject(o, [
          'originOfPlace',
          'origin_of_place',
          'placeOfOrigin',
          'place_of_origin',
          'Origin of Place',
          'Place of Origin',
        ]) || String(o.originOfPlace ?? '').trim(),
      raw: String(o.raw ?? '').trim(),
    };
    if (!d.raw) {
      d.raw = [d.about, d.healthBenefits, d.nutrition, d.originOfPlace].filter(Boolean).join(' ') || d.about;
    }
  } else {
    d = { about: '', healthBenefits: '', nutrition: '', originOfPlace: '', raw: '' };
  }

  if (countStructuredFields(d) >= 2) {
    return d;
  }

  const blob = (d.about || d.raw || '').trim();
  if (!blob) return d;

  const split = splitDescriptionPlainTextInsensitive(blob);
  return mergeDbAndSplit(d, split);
}

module.exports = {
  normalizeDescriptionForClient,
};
