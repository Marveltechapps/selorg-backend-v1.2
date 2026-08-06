const {
  buildPaymentMethodPresentation,
  resolveWorldlineInstrumentLabel,
  buildEstimatedDeliveryMessage,
} = require('../../src/customer-backend/utils/paymentMethodDisplay');

describe('paymentMethodDisplay', () => {
  test('maps cash to Cash on Delivery', () => {
    const p = buildPaymentMethodPresentation({
      paymentMethod: { methodType: 'cash' },
      totalBill: 500,
    });
    expect(p.display).toBe('Cash on Delivery');
  });

  test('maps full wallet to Selorg Wallet', () => {
    const p = buildPaymentMethodPresentation({
      paymentMethod: { methodType: 'wallet' },
      paymentMethodId: 'selorg_wallet',
      walletDeduction: 420,
      totalBill: 420,
    });
    expect(p.display).toBe('Selorg Wallet');
  });

  test('shows partial wallet + worldline breakdown with amounts', () => {
    const p = buildPaymentMethodPresentation({
      paymentMethod: { methodType: 'digital' },
      paymentMethodId: 'wallet_partial_worldline',
      walletDeduction: 300,
      onlineAmountDue: 700,
      totalBill: 1000,
    });
    expect(p.display).toBe('Selorg Wallet + Worldline (UPI/Card)');
    expect(p.lines).toEqual([
      { label: 'Selorg Wallet', amount: 300 },
      { label: 'Worldline (UPI/Card)', amount: 700 },
    ]);
    expect(p.detailDisplay).toContain('Selorg Wallet (₹300)');
    expect(p.detailDisplay).toContain('Worldline (UPI/Card) (₹700)');
  });

  test('resolves PhonePe from UPI VPA handle', () => {
    expect(
      resolveWorldlineInstrumentLabel({ aliasName: 'user@ybl' })
    ).toBe('PhonePe UPI');
  });

  test('resolves Google Pay from UPI handle', () => {
    expect(
      resolveWorldlineInstrumentLabel({ aliasName: 'user@oksbi' })
    ).toBe('Google Pay UPI');
  });

  test('resolves Net Banking from payment mode', () => {
    expect(
      resolveWorldlineInstrumentLabel({ paymentMode: 'netBanking' })
    ).toBe('Net Banking');
  });

  test('resolves Credit/Debit Card from payment mode', () => {
    expect(
      resolveWorldlineInstrumentLabel({ paymentMode: 'cards' })
    ).toBe('Credit/Debit Card');
  });

  test('builds estimated delivery message from SLA window', () => {
    const createdAt = new Date('2026-08-01T10:00:00.000Z');
    // Even if the stored window was 45 minutes, the promise message uses the configured SLA.
    const estimatedDelivery = new Date('2026-08-01T10:45:00.000Z');
    const msg = buildEstimatedDeliveryMessage({
      status: 'confirmed',
      createdAt,
      estimatedDelivery,
    });
    expect(msg).toBe('Estimated delivery: Within 30 minutes');
  });

  test('hides ETA for cancelled orders', () => {
    expect(buildEstimatedDeliveryMessage({ status: 'cancelled' })).toBe('');
  });
});
