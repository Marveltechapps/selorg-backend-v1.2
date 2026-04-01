const pricingEngineService = require('./pricingEngineService');

async function run() {
  const input = {
    userId: 'test-user',
    cartItems: [
      { productId: 'p1', variantId: 'v1', quantity: 2 },
      { productId: 'p2', variantId: 'v2', quantity: 1 },
    ],
    couponCode: null,
    zone: 'test-zone',
    paymentMethod: 'COD',
    mode: 'cart',
  };

  try {
    const response = await pricingEngineService.calculatePricing(input);
    console.log('--- Full Pricing Response ---');
    console.log(JSON.stringify(response, null, 2));
    console.log('--- Totals Only ---');
    console.log(JSON.stringify(response.totals, null, 2));
  } catch (error) {
    console.error('Pricing engine test failed:', error?.message || error);
    process.exitCode = 1;
  }
}

run();
