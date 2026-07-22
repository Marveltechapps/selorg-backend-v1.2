const { dedupeHomeSectionDefinitions } = require('../../src/customer-backend/utils/dedupeHomeSectionDefinitions');

describe('dedupeHomeSectionDefinitions', () => {
  test('keeps canonical key and drops _2 suffix duplicate with same label', () => {
    const input = [
      {
        key: 'collections_deal_in_lowest_price',
        label: 'Deal in lowest price',
        type: 'collections',
        order: 4,
      },
      {
        key: 'collections_deal_in_lowest_price_2',
        label: 'Deal in lowest price',
        type: 'collections',
        order: 5,
      },
      {
        key: 'collections_high_nutrition_products',
        label: 'High nutrition products',
        type: 'collections',
        order: 6,
      },
    ];
    const out = dedupeHomeSectionDefinitions(input);
    expect(out.map((d) => d.key)).toEqual([
      'collections_deal_in_lowest_price',
      'collections_high_nutrition_products',
    ]);
  });
});
