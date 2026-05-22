/**
 * Canonical payment method buckets for finance overview split + filters.
 */

const BUCKET_LABELS = {
  cards: 'Cards',
  digital_wallets: 'UPI & Wallets',
  cod: 'Cash on Delivery',
  other: 'Other',
};

function resolveBucketFromLiveTxn(txn) {
  const method = String(txn?.methodDisplay || '').toLowerCase();
  const gateway = String(txn?.gateway || '').toLowerCase();

  if (gateway === 'cod' || method.includes('cash on delivery') || /\bcod\b/.test(method) || method.includes('cash')) {
    return 'cod';
  }
  if (
    method.includes('upi') ||
    method.includes('wallet') ||
    method.includes('net banking') ||
    method.includes('net_banking') ||
    method.includes('gpay') ||
    method.includes('phonepe') ||
    method.includes('paytm')
  ) {
    return 'digital_wallets';
  }
  if (method.includes('card') || method.includes('credit') || method.includes('debit')) {
    return 'cards';
  }
  if (gateway && gateway !== 'cod' && gateway !== 'internal') {
    return 'cards';
  }
  return 'other';
}

function resolveBucketFromCustomerPayment(payment) {
  const type = String(payment?.methodType || '').toLowerCase();
  const display = String(payment?.paymentMethodDisplay || '').toLowerCase();

  if (type === 'cod' || type === 'cash' || display.includes('cash on delivery') || /\bcod\b/.test(display)) {
    return 'cod';
  }
  if (type === 'upi' || type === 'wallet' || type === 'net_banking') {
    return 'digital_wallets';
  }
  if (type === 'card') {
    return 'cards';
  }
  return resolveBucketFromLiveTxn({
    methodDisplay: payment?.paymentMethodDisplay,
    gateway: type === 'cash' ? 'cod' : '',
  });
}

function bucketLabel(key) {
  return BUCKET_LABELS[key] || BUCKET_LABELS.other;
}

module.exports = {
  BUCKET_LABELS,
  resolveBucketFromLiveTxn,
  resolveBucketFromCustomerPayment,
  bucketLabel,
};
