const {
  parseHomePageContent,
  consolidateCollectionSpecs,
  collectionMergeKey,
  mergeSkuLists,
  keyFromCollectionSlug,
} = require('../../src/customer-backend/services/import/homePageContentImport.service');

function mockWorksheet(rows) {
  return {
    rowCount: rows.length,
    getRow(r) {
      const cells = rows[r - 1] || [];
      return {
        getCell(c) {
          return { value: cells[c - 1] ?? '' };
        },
      };
    },
  };
}

describe('homePageContentImport', () => {
  test('merges duplicate collection rows with the same label', () => {
    const ws = mockWorksheet([
      ['Homepage', 'Homepage', 'Homepage'],
      ['Section Type', 'Section Name', 'Required Details'],
      ['', '', ''],
      ['Collections', 'Deal in lowest price', 'S524,S134'],
      ['', '', ''],
      ['Collections', 'Deal in lowest price', 'S1360,S1369'],
      ['Collections', 'High nutrition products', 'S3082'],
    ]);
    const warnings = [];
    const specs = parseHomePageContent(ws, warnings);
    const deal = specs.find((s) => s.kind === 'collections' && s.label === 'Deal in lowest price');
    expect(deal).toBeTruthy();
    expect(deal.skuList).toEqual(['S524', 'S134', 'S1360', 'S1369']);
    expect(deal.sourceRows).toEqual([4, 6]);
    expect(warnings.some((w) => /Duplicate collection "Deal in lowest price"/.test(w.message))).toBe(true);
    expect(specs.filter((s) => s.kind === 'collections' && /deal/i.test(s.label))).toHaveLength(1);
  });

  test('merges labels that slugify identically despite punctuation differences', () => {
    const specs = consolidateCollectionSpecs(
      [
        { kind: 'collections', label: 'Deal in lowest price', skuList: ['S1'], sourceRows: [4] },
        { kind: 'collections', label: 'Deal in lowest price.', skuList: ['S2'], sourceRows: [6] },
      ],
      []
    );
    expect(specs).toHaveLength(1);
    expect(specs[0].skuList).toEqual(['S1', 'S2']);
    expect(collectionMergeKey('Deal in lowest price')).toBe(collectionMergeKey('Deal in lowest price.'));
    expect(keyFromCollectionSlug('deal-in-lowest-price')).toBe('collections_deal_in_lowest_price');
  });

  test('mergeSkuLists deduplicates SKUs', () => {
    const list = ['S1', 'S2'];
    mergeSkuLists(list, ['S2', 'S3']);
    expect(list).toEqual(['S1', 'S2', 'S3']);
  });
});
