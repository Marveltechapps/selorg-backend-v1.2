/**
 * Multilingual grocery keyword dictionary.
 * Maps canonical English terms to Tamil, Tanglish, and Hindi variants.
 * Used for query expansion and automatic keyword generation on import.
 */

/** @type {Record<string, { english?: string[], tanglish?: string[], tamil?: string[], hindi?: string[], synonyms?: string[] }>} */
const GROCERY_TERMS = {
  rice: {
    english: ['rice'],
    tanglish: ['arisi', 'arisi'],
    tamil: ['அரிசி'],
    hindi: ['chawal', 'चावल'],
    synonyms: ['basmati', 'basmathi', 'pacharisi', 'pachai arisi'],
  },
  milk: {
    english: ['milk'],
    tanglish: ['paal', 'pal'],
    tamil: ['பால்'],
    hindi: ['doodh', 'dudh', 'दूध'],
    synonyms: ['dairy', 'cow milk', 'toned milk'],
  },
  sugar: {
    english: ['sugar'],
    tanglish: ['sakkarai', 'sakkare', 'chakkarai'],
    tamil: ['சர்க்கரை'],
    hindi: ['chini', 'shakkar', 'चीनी'],
    synonyms: ['white sugar', 'brown sugar'],
  },
  oil: {
    english: ['oil'],
    tanglish: ['ennai', 'enney'],
    tamil: ['எண்ணெய்'],
    hindi: ['tel', 'तेल'],
    synonyms: ['cooking oil', 'sunflower oil', 'groundnut oil', 'coconut oil', 'mustard oil', 'sesame oil'],
  },
  tomato: {
    english: ['tomato', 'tomatoes'],
    tanglish: ['thakkali', 'thakali', 'takkali'],
    tamil: ['தக்காளி'],
    hindi: ['tamatar', 'टमाटर'],
    synonyms: ['cherry tomato'],
  },
  onion: {
    english: ['onion', 'onions'],
    tanglish: ['vengayam', 'vengaayam', 'ulli'],
    tamil: ['வெங்காயம்'],
    hindi: ['pyaz', 'pyaaz', 'प्याज'],
    synonyms: ['shallot', 'red onion'],
  },
  dal: {
    english: ['dal', 'lentil', 'lentils', 'pulses'],
    tanglish: ['paruppu', 'parupu'],
    tamil: ['பருப்பு'],
    hindi: ['daal', 'दाल'],
    synonyms: ['toor dal', 'moong dal', 'urad dal', 'chana dal'],
  },
  wheat: {
    english: ['wheat', 'flour', 'atta'],
    tanglish: ['godhumai', 'godumai', 'maavu'],
    tamil: ['கோதுமை', 'மாவு'],
    hindi: ['gehun', 'aata', 'गेहूं', 'आटा'],
    synonyms: ['whole wheat', 'maida'],
  },
  bread: {
    english: ['bread'],
    tanglish: ['rotti', 'rothi'],
    tamil: ['ரொட்டி'],
    hindi: ['roti', 'रोटी'],
    synonyms: ['bun', 'pav'],
  },
  egg: {
    english: ['egg', 'eggs'],
    tanglish: ['muttai', 'muttai'],
    tamil: ['முட்டை'],
    hindi: ['anda', 'अंडा'],
    synonyms: ['brown egg', 'white egg'],
  },
  potato: {
    english: ['potato', 'potatoes'],
    tanglish: ['urulaikizhangu', 'urulai'],
    tamil: ['உருளைக்கிழங்கு'],
    hindi: ['aloo', 'आलू'],
    synonyms: ['baby potato'],
  },
  carrot: {
    english: ['carrot', 'carrots'],
    tanglish: ['carrot', 'carrott'],
    tamil: ['கேரட்'],
    hindi: ['gajar', 'गाजर'],
  },
  banana: {
    english: ['banana', 'bananas'],
    tanglish: ['vazhai', 'vazhaipazham'],
    tamil: ['வாழை', 'வாழைப்பழம்'],
    hindi: ['kela', 'केला'],
  },
  apple: {
    english: ['apple', 'apples'],
    tanglish: ['apple'],
    tamil: ['ஆப்பிள்'],
    hindi: ['seb', 'सेब'],
  },
  mango: {
    english: ['mango', 'mangoes'],
    tanglish: ['maanga', 'manga'],
    tamil: ['மாம்பழம்', 'மா'],
    hindi: ['aam', 'आम'],
  },
  lemon: {
    english: ['lemon', 'lemons', 'lime'],
    tanglish: ['elumichai', 'elumicham'],
    tamil: ['எலுமிச்சை'],
    hindi: ['nimbu', 'नींबू'],
  },
  ginger: {
    english: ['ginger'],
    tanglish: ['inji'],
    tamil: ['இஞ்சி'],
    hindi: ['adrak', 'अदरक'],
  },
  garlic: {
    english: ['garlic'],
    tanglish: ['poondu'],
    tamil: ['பூண்டு'],
    hindi: ['lahsun', 'लहसुन'],
  },
  chilli: {
    english: ['chilli', 'chili', 'chillies', 'pepper'],
    tanglish: ['milagai', 'milagay'],
    tamil: ['மிளகாய்'],
    hindi: ['mirch', 'मिर्च'],
    synonyms: ['green chilli', 'red chilli'],
  },
  salt: {
    english: ['salt'],
    tanglish: ['uppu'],
    tamil: ['உப்பு'],
    hindi: ['namak', 'नमक'],
    synonyms: ['iodized salt', 'rock salt'],
  },
  tea: {
    english: ['tea'],
    tanglish: ['tea', 'thanni'],
    tamil: ['தேநீர்'],
    hindi: ['chai', 'चाय'],
    synonyms: ['green tea', 'black tea'],
  },
  coffee: {
    english: ['coffee'],
    tanglish: ['kappi', 'kaapi'],
    tamil: ['காபி'],
    hindi: ['coffee', 'कॉफी'],
  },
  butter: {
    english: ['butter'],
    tanglish: ['vennai'],
    tamil: ['வெண்ணெய்'],
    hindi: ['makhan', 'मक्खन'],
  },
  ghee: {
    english: ['ghee'],
    tanglish: ['ney'],
    tamil: ['நெய்'],
    hindi: ['ghee', 'घी'],
  },
  curd: {
    english: ['curd', 'yogurt', 'yoghurt'],
    tanglish: ['thayir', 'thair'],
    tamil: ['தயிர்'],
    hindi: ['dahi', 'दही'],
  },
  paneer: {
    english: ['paneer', 'cottage cheese'],
    tanglish: ['paneer'],
    tamil: ['பனீர்'],
    hindi: ['paneer', 'पनीर'],
  },
  chicken: {
    english: ['chicken'],
    tanglish: ['kozhi', 'koli'],
    tamil: ['கோழி'],
    hindi: ['murghi', 'मुर्गी'],
  },
  fish: {
    english: ['fish'],
    tanglish: ['meen'],
    tamil: ['மீன்'],
    hindi: ['machli', 'मछली'],
  },
  vegetables: {
    english: ['vegetable', 'vegetables', 'veggies'],
    tanglish: ['kai kari', 'kaikari', 'veg'],
    tamil: ['காய்கறி'],
    hindi: ['sabzi', 'सब्जी'],
    synonyms: ['fresh vegetables', 'greens'],
  },
  fruits: {
    english: ['fruit', 'fruits'],
    tanglish: ['pazham', 'pazhama'],
    tamil: ['பழம்'],
    hindi: ['phal', 'फल'],
  },
  snacks: {
    english: ['snack', 'snacks'],
    tanglish: ['tiffin'],
    tamil: ['சிற்றுண்டி'],
    hindi: ['nashta', 'नाश्ता'],
  },
  biscuits: {
    english: ['biscuit', 'biscuits', 'cookie', 'cookies'],
    tanglish: ['biscuit'],
    tamil: ['பிஸ்கட்'],
    hindi: ['biskut', 'बिस्कुट'],
  },
  noodles: {
    english: ['noodle', 'noodles', 'pasta'],
    tanglish: ['noodles'],
    tamil: ['நூடுல்ஸ்'],
    hindi: ['noodles', 'नूडल्स'],
    synonyms: ['instant noodles', 'maggi'],
  },
  soap: {
    english: ['soap'],
    tanglish: ['soap'],
    tamil: ['சோப்பு'],
    hindi: ['sabun', 'साबुन'],
  },
  shampoo: {
    english: ['shampoo'],
    tanglish: ['shampoo'],
    tamil: ['ஷாம்பூ'],
    hindi: ['shampoo', 'शैम्पू'],
  },
  detergent: {
    english: ['detergent', 'washing powder'],
    tanglish: ['detergent'],
    tamil: ['சலவைத்தூள்'],
    hindi: ['detergent', 'डिटर्जेंट'],
  },
  water: {
    english: ['water'],
    tanglish: ['thanni', 'neer'],
    tamil: ['தண்ணீர்', 'நீர்'],
    hindi: ['pani', 'पानी'],
    synonyms: ['mineral water', 'drinking water'],
  },
  juice: {
    english: ['juice'],
    tanglish: ['juice'],
    tamil: ['சாறு'],
    hindi: ['juice', 'रस'],
  },
  honey: {
    english: ['honey'],
    tanglish: ['then'],
    tamil: ['தேன்'],
    hindi: ['shahad', 'शहद'],
  },
  spices: {
    english: ['spice', 'spices', 'masala'],
    tanglish: ['masala', 'masalaa'],
    tamil: ['மசாலா'],
    hindi: ['masala', 'मसाला'],
  },
  turmeric: {
    english: ['turmeric'],
    tanglish: ['manjal'],
    tamil: ['மஞ்சள்'],
    hindi: ['haldi', 'हल्दी'],
  },
  cumin: {
    english: ['cumin'],
    tanglish: ['jeeragam', 'seeragam'],
    tamil: ['சீரகம்'],
    hindi: ['jeera', 'जीरा'],
  },
  coriander: {
    english: ['coriander', 'cilantro'],
    tanglish: ['kothamalli'],
    tamil: ['கொத்தமல்லி'],
    hindi: ['dhaniya', 'धनिया'],
  },
  spinach: {
    english: ['spinach', 'greens'],
    tanglish: ['keerai'],
    tamil: ['கீரை'],
    hindi: ['palak', 'पालक'],
  },
  coconut: {
    english: ['coconut'],
    tanglish: ['thengai', 'thenkai'],
    tamil: ['தேங்காய்'],
    hindi: ['nariyal', 'नारियल'],
  },
  peanuts: {
    english: ['peanut', 'peanuts', 'groundnut'],
    tanglish: ['verkadalai', 'kadalai'],
    tamil: ['வேர்க்கடலை'],
    hindi: ['moongfali', 'मूंगफली'],
  },
  cashew: {
    english: ['cashew', 'cashews'],
    tanglish: ['mundhiri'],
    tamil: ['முந்திரி'],
    hindi: ['kaju', 'काजू'],
  },
  almonds: {
    english: ['almond', 'almonds'],
    tanglish: ['badam'],
    tamil: ['பாதாம்'],
    hindi: ['badam', 'बादाम'],
  },
};

/** @type {Map<string, string>} normalized term → canonical key */
const TERM_TO_CANONICAL = new Map();

/** @type {Map<string, string[]>} canonical key → all keyword variants */
const CANONICAL_KEYWORDS = new Map();

function normalizeDictKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\u0900-\u097F\u0B80-\u0BFF]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildDictionaryIndexes() {
  for (const [canonical, groups] of Object.entries(GROCERY_TERMS)) {
    const all = new Set([canonical]);
    for (const list of Object.values(groups)) {
      if (!Array.isArray(list)) continue;
      for (const term of list) {
        const t = String(term || '').trim();
        if (t) all.add(t);
      }
    }
    const keywords = [...all];
    CANONICAL_KEYWORDS.set(canonical, keywords);
    for (const kw of keywords) {
      const norm = normalizeDictKey(kw);
      if (norm) TERM_TO_CANONICAL.set(norm, canonical);
    }
  }
}

buildDictionaryIndexes();

/**
 * Find canonical grocery terms present in a product name or text.
 * @param {string} text
 * @returns {string[]}
 */
function findCanonicalTermsInText(text) {
  const normalized = normalizeDictKey(text);
  if (!normalized) return [];
  const found = new Set();
  for (const [canonical, keywords] of CANONICAL_KEYWORDS.entries()) {
    for (const kw of keywords) {
      const normKw = normalizeDictKey(kw);
      if (!normKw || normKw.length < 2) continue;
      if (normalized.includes(normKw)) {
        found.add(canonical);
        break;
      }
    }
  }
  return [...found];
}

/**
 * Get all multilingual keywords for a canonical term.
 * @param {string} canonical
 * @returns {string[]}
 */
function getKeywordsForCanonical(canonical) {
  return CANONICAL_KEYWORDS.get(canonical) || [];
}

/**
 * Expand a search query term to all related multilingual variants.
 * @param {string} term
 * @returns {string[]}
 */
function expandTermToKeywords(term) {
  const norm = normalizeDictKey(term);
  if (!norm) return [];
  const canonical = TERM_TO_CANONICAL.get(norm);
  if (canonical) {
    return getKeywordsForCanonical(canonical);
  }
  // Partial dictionary match for prefix queries (e.g. "cha" → chawal → rice)
  for (const [dictNorm, dictCanonical] of TERM_TO_CANONICAL.entries()) {
    if (dictNorm.startsWith(norm) || norm.startsWith(dictNorm)) {
      if (norm.length >= 2 || dictNorm.length <= 3) {
        return getKeywordsForCanonical(dictCanonical);
      }
    }
  }
  return [term];
}

module.exports = {
  GROCERY_TERMS,
  normalizeDictKey,
  findCanonicalTermsInText,
  getKeywordsForCanonical,
  expandTermToKeywords,
  TERM_TO_CANONICAL,
  CANONICAL_KEYWORDS,
};
