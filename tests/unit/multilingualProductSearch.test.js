/**
 * Unit tests for multilingual product search keyword generation and query expansion.
 */

const {
  expandSearchQuery,
  normalizeSearchToken,
  isFuzzyMatch,
  levenshteinDistance,
} = require('../../src/customer-backend/services/search/searchNormalization');

const {
  findCanonicalTermsInText,
  expandTermToKeywords,
  getKeywordsForCanonical,
} = require('../../src/customer-backend/services/search/groceryKeywordDictionary');

const {
  generateProductSearchKeywords,
} = require('../../src/customer-backend/services/search/productSearchKeywords');

const {
  computeRelevanceScore,
} = require('../../src/customer-backend/services/search/productSearchService');

describe('multilingual search - query expansion', () => {
  test('expands English rice to all language variants', () => {
    const expanded = expandSearchQuery('rice');
    expect(expanded).toEqual(expect.arrayContaining(['rice', 'arisi', 'அரிசி', 'chawal', 'चावल']));
  });

  test('expands Tamil அரிசி to rice variants', () => {
    const expanded = expandSearchQuery('அரிசி');
    expect(expanded).toEqual(expect.arrayContaining(['rice', 'arisi', 'chawal']));
  });

  test('expands Tanglish arisi to rice variants', () => {
    const expanded = expandSearchQuery('arisi');
    expect(expanded).toEqual(expect.arrayContaining(['rice', 'அரிசி', 'chawal']));
  });

  test('expands Hindi चावल to rice variants', () => {
    const expanded = expandSearchQuery('चावल');
    expect(expanded).toEqual(expect.arrayContaining(['rice', 'arisi', 'chawal']));
  });

  test('expands milk variants', () => {
    for (const q of ['milk', 'paal', 'பால்', 'doodh', 'दूध']) {
      const expanded = expandSearchQuery(q);
      expect(expanded).toEqual(expect.arrayContaining(['milk', 'paal', 'பால்']));
    }
  });

  test('expands tomato variants including thakkali typo', () => {
    const expanded = expandSearchQuery('thakkali');
    expect(expanded).toEqual(expect.arrayContaining(['tomato', 'தக்காளி', 'tamatar']));
  });

  test('expands sugar variants', () => {
    for (const q of ['sugar', 'sakkarai', 'சர்க்கரை', 'chini', 'चीनी']) {
      const expanded = expandSearchQuery(q);
      expect(expanded).toEqual(expect.arrayContaining(['sugar', 'sakkarai']));
    }
  });

  test('expands oil variants', () => {
    for (const q of ['oil', 'ennai', 'எண்ணெய்', 'tel', 'तेल']) {
      const expanded = expandSearchQuery(q);
      expect(expanded).toEqual(expect.arrayContaining(['oil', 'ennai']));
    }
  });

  test('prefix cha expands to rice (chawal)', () => {
    const expanded = expandTermToKeywords('cha');
    expect(expanded).toEqual(expect.arrayContaining(['rice', 'chawal', 'चावल']));
  });
});

describe('multilingual search - keyword generation', () => {
  test('generates keywords for Rice product', () => {
    const { searchKeywords } = generateProductSearchKeywords({ name: 'Rice' });
    expect(searchKeywords).toEqual(expect.arrayContaining([
      'Rice', 'rice', 'arisi', 'அரிசி', 'chawal', 'चावल',
    ]));
  });

  test('generates keywords for Milk product', () => {
    const { searchKeywords } = generateProductSearchKeywords({ name: 'Toned Milk 500ml' });
    expect(searchKeywords).toEqual(expect.arrayContaining([
      'milk', 'paal', 'பால்', 'doodh', 'दूध',
    ]));
  });

  test('generates keywords for Tomato product', () => {
    const { searchKeywords } = generateProductSearchKeywords({ name: 'Fresh Tomato 1kg' });
    expect(searchKeywords).toEqual(expect.arrayContaining([
      'tomato', 'thakkali', 'தக்காளி', 'tamatar',
    ]));
  });

  test('includes brand and sku in keywords', () => {
    const { searchKeywords } = generateProductSearchKeywords({
      name: 'Basmati Rice',
      brand: 'India Gate',
      sku: 'RICE-001',
    });
    expect(searchKeywords).toEqual(expect.arrayContaining(['India Gate', 'RICE-001', 'rice']));
  });

  test('includes category vegetables aliases', () => {
    const { searchKeywords } = generateProductSearchKeywords({
      name: 'Mixed Veg Pack',
      categoryName: 'Vegetables',
    });
    expect(searchKeywords).toEqual(expect.arrayContaining(['vegetables', 'veg', 'காய்கறி']));
  });

  test('includes meta keywords', () => {
    const { searchKeywords } = generateProductSearchKeywords({
      name: 'Organic Sugar',
      meta: { keywords: 'sweetener, white sugar' },
    });
    expect(searchKeywords).toEqual(expect.arrayContaining(['sweetener', 'white sugar', 'sugar']));
  });
});

describe('multilingual search - fuzzy matching', () => {
  test('fuzzy matches milk typos', () => {
    expect(isFuzzyMatch('mil', 'milk')).toBe(true);
    expect(isFuzzyMatch('mik', 'milk')).toBe(true);
    expect(isFuzzyMatch('mlik', 'milk')).toBe(true);
    expect(isFuzzyMatch('milk', 'milk')).toBe(true);
  });

  test('fuzzy matches thakali to thakkali/tomato', () => {
    expect(isFuzzyMatch('thakali', 'thakkali')).toBe(true);
  });

  test('levenshtein distance for common typos', () => {
    expect(levenshteinDistance('mik', 'milk')).toBeLessThanOrEqual(2);
    expect(levenshteinDistance('mlik', 'milk')).toBeLessThanOrEqual(2);
  });
});

describe('multilingual search - relevance ranking', () => {
  const riceProduct = {
    _id: '1',
    name: 'Rice',
    searchKeywords: ['rice', 'arisi', 'அரிசி', 'chawal', 'चावल'],
    sortOrder: 1,
  };

  test('exact English name match scores highest', () => {
    const scoreExact = computeRelevanceScore(riceProduct, 'rice', expandSearchQuery('rice'));
    const scorePartial = computeRelevanceScore(riceProduct, 'ri', expandSearchQuery('ri'));
    expect(scoreExact).toBeGreaterThan(scorePartial);
  });

  test('Tamil query matches rice product', () => {
    const score = computeRelevanceScore(riceProduct, 'அரிசி', expandSearchQuery('அரிசி'));
    expect(score).toBeGreaterThan(0);
  });
});

describe('multilingual search - dictionary lookup', () => {
  test('finds rice in product name', () => {
    expect(findCanonicalTermsInText('Basmati Rice 5kg')).toContain('rice');
  });

  test('getKeywordsForCanonical returns all variants', () => {
    const kws = getKeywordsForCanonical('milk');
    expect(kws).toEqual(expect.arrayContaining(['milk', 'paal', 'பால்', 'doodh', 'दूध']));
  });
});

describe('multilingual search - normalization', () => {
  test('case insensitive normalization', () => {
    expect(normalizeSearchToken('RICE')).toBe(normalizeSearchToken('rice'));
    expect(normalizeSearchToken('RICE')).toBe(normalizeSearchToken('Rice'));
  });
});
