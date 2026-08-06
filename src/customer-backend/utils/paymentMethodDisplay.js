/**
 * Human-readable payment method labels for customer order APIs / invoices.
 * Prefer gateway instrument hints (Paynimo mode, bank code, UPI VPA) when present.
 */

const METHOD_TYPE_LABELS = {
  cash: 'Cash on Delivery',
  cod: 'Cash on Delivery',
  wallet: 'Selorg Wallet',
  selorg_wallet: 'Selorg Wallet',
  upi: 'UPI',
  card: 'Credit/Debit Card',
  cards: 'Credit/Debit Card',
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
  netbanking: 'Net Banking',
  net_banking: 'Net Banking',
  digital: 'Worldline (UPI/Card)',
  worldline: 'Worldline (UPI/Card)',
  worldline_digital: 'Worldline (UPI/Card)',
};

/** Common Paynimo / TechProcess bank codes → display label */
const BANK_CODE_LABELS = {
  UPI: 'UPI',
  UP: 'UPI',
  NB: 'Net Banking',
  NETB: 'Net Banking',
  CC: 'Credit Card',
  DC: 'Debit Card',
  CARD: 'Credit/Debit Card',
  CRD: 'Credit/Debit Card',
  WALLET: 'Wallet',
};

/** UPI VPA handle suffixes → PSP name */
const UPI_HANDLE_LABELS = {
  ybl: 'PhonePe',
  ibl: 'PhonePe',
  axl: 'PhonePe',
  phonepe: 'PhonePe',
  oksbi: 'Google Pay',
  okaxis: 'Google Pay',
  okhdfcbank: 'Google Pay',
  okicici: 'Google Pay',
  okyesbank: 'Google Pay',
  okkotak: 'Google Pay',
  gpay: 'Google Pay',
  googlepay: 'Google Pay',
  paytm: 'Paytm',
  ptyl: 'Paytm',
  apl: 'Amazon Pay',
  amazonpay: 'Amazon Pay',
  bhim: 'BHIM',
};

function roundMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function formatInr(amount) {
  const n = roundMoney(amount);
  if (Number.isInteger(n)) return `₹${n}`;
  return `₹${n.toFixed(2)}`;
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function labelFromPaymentMode(paymentMode) {
  const mode = String(paymentMode || '').trim();
  if (!mode || mode.toLowerCase() === 'all') return '';
  const lower = mode.toLowerCase();
  if (lower === 'upi') return 'UPI';
  if (lower === 'cards' || lower === 'card') return 'Credit/Debit Card';
  if (lower === 'netbanking' || lower === 'net_banking' || lower === 'nb') return 'Net Banking';
  if (lower === 'wallets' || lower === 'wallet') return 'Wallet';
  return METHOD_TYPE_LABELS[normalizeKey(mode)] || '';
}

function labelFromUpiHandle(aliasOrVpa) {
  const raw = String(aliasOrVpa || '').trim().toLowerCase();
  if (!raw) return '';
  const at = raw.lastIndexOf('@');
  const handle = at >= 0 ? raw.slice(at + 1) : raw.replace(/^@/, '');
  if (!handle) return '';
  if (UPI_HANDLE_LABELS[handle]) return UPI_HANDLE_LABELS[handle];
  // Partial match (e.g. @okhdfcbank already exact; also handle compound)
  for (const [suffix, label] of Object.entries(UPI_HANDLE_LABELS)) {
    if (handle === suffix || handle.endsWith(suffix) || handle.includes(suffix)) {
      return label;
    }
  }
  return '';
}

function labelFromBankCode(bankCd) {
  const raw = String(bankCd || '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (BANK_CODE_LABELS[upper]) return BANK_CODE_LABELS[upper];
  const lower = raw.toLowerCase();
  if (lower.includes('upi')) return 'UPI';
  if (lower.includes('phonepe') || lower.includes('ybl')) return 'PhonePe';
  if (lower.includes('gpay') || lower.includes('google')) return 'Google Pay';
  if (lower.includes('paytm')) return 'Paytm';
  if (lower.includes('net') || lower === 'nb') return 'Net Banking';
  if (lower.includes('credit') || upper === 'CC') return 'Credit Card';
  if (lower.includes('debit') || upper === 'DC') return 'Debit Card';
  if (lower.includes('card')) return 'Credit/Debit Card';
  return '';
}

/**
 * Infer a customer-facing Worldline / digital instrument label.
 * @param {object} [hints]
 * @param {string} [hints.paymentMode] - Paynimo session paymentMode
 * @param {string} [hints.tpslBankCd]
 * @param {string} [hints.aliasName] - often UPI VPA
 * @param {string} [hints.cardId]
 * @param {string} [hints.instrument] - previously persisted instrument key/label
 * @param {string} [hints.displayLabel] - previously persisted display label
 */
function resolveWorldlineInstrumentLabel(hints = {}) {
  if (hints.displayLabel && String(hints.displayLabel).trim()) {
    return String(hints.displayLabel).trim();
  }
  if (hints.instrument) {
    const fromInstrument =
      METHOD_TYPE_LABELS[normalizeKey(hints.instrument)] ||
      labelFromBankCode(hints.instrument) ||
      labelFromUpiHandle(hints.instrument);
    if (fromInstrument) {
      const psp = labelFromUpiHandle(hints.aliasName);
      if (psp && /upi/i.test(fromInstrument) && !/phonepe|google pay|paytm|bhim|amazon/i.test(fromInstrument)) {
        return `${psp} UPI`;
      }
      if (/^upi$/i.test(fromInstrument) && psp) return `${psp} UPI`;
      return fromInstrument;
    }
  }

  const fromVpa = labelFromUpiHandle(hints.aliasName);
  if (fromVpa) return `${fromVpa} UPI`;

  const fromBank = labelFromBankCode(hints.tpslBankCd);
  if (fromBank) {
    if (/^upi$/i.test(fromBank) && fromVpa) return `${fromVpa} UPI`;
    return fromBank;
  }

  if (hints.cardId && String(hints.cardId).trim()) {
    return 'Credit/Debit Card';
  }

  const fromMode = labelFromPaymentMode(hints.paymentMode);
  if (fromMode) {
    if (/^upi$/i.test(fromMode) && fromVpa) return `${fromVpa} UPI`;
    return fromMode;
  }

  return 'Worldline (UPI/Card)';
}

function extractWorldlineHints(worldlinePayment) {
  if (!worldlinePayment || typeof worldlinePayment !== 'object') return {};
  const session =
    worldlinePayment.rawSessionRequest?.consumerData ||
    worldlinePayment.rawSessionRequest?.consumer_data ||
    worldlinePayment.rawSessionRequest ||
    {};
  const gateway =
    worldlinePayment.rawGatewayResponse ||
    worldlinePayment.rawGatewayReturn ||
    {};
  return {
    paymentMode:
      worldlinePayment.paymentMode ||
      session.paymentMode ||
      session.payment_mode ||
      '',
    tpslBankCd: worldlinePayment.tpslBankCd || gateway.tpsl_bank_cd || gateway.tpslBankCd || '',
    aliasName: gateway.alias_name || gateway.aliasName || '',
    cardId: gateway.card_id || gateway.cardId || '',
  };
}

function baseTypeLabel(methodType, paymentMethodId) {
  const idKey = normalizeKey(paymentMethodId);
  if (idKey && METHOD_TYPE_LABELS[idKey] && idKey !== 'digital') {
    return METHOD_TYPE_LABELS[idKey];
  }
  const typeKey = normalizeKey(methodType);
  return METHOD_TYPE_LABELS[typeKey] || methodType || 'Payment';
}

/**
 * Build display fields for an order document (lean or mongoose).
 * @param {object} order
 * @param {object} [worldlinePayment] - optional latest WorldlinePayment lean doc
 * @returns {{
 *   display: string,
 *   lines: Array<{ label: string, amount: number|null }>,
 *   instrument: string,
 *   onlineLabel: string,
 * }}
 */
function buildPaymentMethodPresentation(order, worldlinePayment) {
  const methodType = order?.paymentMethod?.methodType || order?.paymentMethod?.type || 'cash';
  const paymentMethodId = order?.paymentMethodId || order?.paymentMethod?.id || '';
  const walletPart = roundMoney(order?.walletDeduction);
  const onlineDue =
    order?.onlineAmountDue != null && Number(order.onlineAmountDue) >= 0
      ? roundMoney(order.onlineAmountDue)
      : walletPart > 0
        ? Math.max(0, roundMoney(Number(order?.totalBill) || 0) - walletPart)
        : 0;
  const isPartialWallet =
    walletPart > 0 &&
    (normalizeKey(paymentMethodId) === 'wallet_partial_worldline' ||
      (['digital', 'card', 'upi'].includes(normalizeKey(methodType)) && onlineDue > 0));

  const persisted = {
    instrument: order?.paymentMethod?.instrument || '',
    displayLabel: order?.paymentMethod?.displayLabel || '',
    paymentMode: order?.paymentMethod?.paymentMode || '',
  };
  const wlHints = { ...extractWorldlineHints(worldlinePayment), ...persisted };
  const onlineLabel = ['digital', 'card', 'upi'].includes(normalizeKey(methodType))
    ? resolveWorldlineInstrumentLabel(wlHints)
    : baseTypeLabel(methodType, paymentMethodId);

  if (normalizeKey(methodType) === 'wallet' || normalizeKey(paymentMethodId) === 'selorg_wallet') {
    if (!(onlineDue > 0)) {
      return {
        display: 'Selorg Wallet',
        lines: [{ label: 'Selorg Wallet', amount: walletPart > 0 ? walletPart : roundMoney(order?.totalBill) || null }],
        instrument: 'wallet',
        onlineLabel: '',
      };
    }
  }

  if (isPartialWallet) {
    const lines = [
      { label: 'Selorg Wallet', amount: walletPart },
      { label: onlineLabel, amount: onlineDue },
    ];
    const display = lines
      .map((l) => (l.amount != null && l.amount > 0 ? `${l.label} (${formatInr(l.amount)})` : l.label))
      .join('\n');
    const compact = `Selorg Wallet + ${onlineLabel}`;
    return {
      display: compact,
      detailDisplay: display,
      lines,
      instrument: normalizeKey(wlHints.instrument) || 'digital',
      onlineLabel,
    };
  }

  if (normalizeKey(methodType) === 'cash' || normalizeKey(methodType) === 'cod') {
    return {
      display: 'Cash on Delivery',
      lines: [{ label: 'Cash on Delivery', amount: null }],
      instrument: 'cash',
      onlineLabel: '',
    };
  }

  if (['digital', 'card', 'upi'].includes(normalizeKey(methodType))) {
    return {
      display: onlineLabel,
      lines: [{ label: onlineLabel, amount: roundMoney(order?.totalBill) || null }],
      instrument: normalizeKey(wlHints.instrument) || normalizeKey(methodType),
      onlineLabel,
    };
  }

  const label = baseTypeLabel(methodType, paymentMethodId);
  return {
    display: label,
    lines: [{ label, amount: null }],
    instrument: normalizeKey(methodType),
    onlineLabel: '',
  };
}

/**
 * Resolve a single string for invoices / finance (no multi-line).
 */
function resolvePaymentLabel(paymentMethod, paymentMethodFallback, extras = {}) {
  if (extras.order) {
    const { display, detailDisplay, lines } = buildPaymentMethodPresentation(extras.order, extras.worldlinePayment);
    if (lines && lines.length > 1) {
      return lines
        .map((l) => (l.amount != null && l.amount > 0 ? `${l.label} (${formatInr(l.amount)})` : l.label))
        .join(' + ');
    }
    return detailDisplay || display;
  }

  if (typeof paymentMethod === 'string') {
    return METHOD_TYPE_LABELS[normalizeKey(paymentMethod)] || paymentMethod;
  }
  if (paymentMethod && typeof paymentMethod === 'object') {
    const key = paymentMethod.type || paymentMethod.methodType || '';
    let label =
      paymentMethod.displayLabel ||
      METHOD_TYPE_LABELS[normalizeKey(key)] ||
      key ||
      'N/A';
    if (normalizeKey(key) === 'wallet') label = 'Selorg Wallet';
    if (normalizeKey(key) === 'digital') {
      label = resolveWorldlineInstrumentLabel({
        instrument: paymentMethod.instrument,
        displayLabel: paymentMethod.displayLabel,
        paymentMode: paymentMethod.paymentMode,
      });
    }
    if (paymentMethod.last4) return `${label} (****${paymentMethod.last4})`;
    return label;
  }
  if (typeof paymentMethodFallback === 'string') {
    return METHOD_TYPE_LABELS[normalizeKey(paymentMethodFallback)] || paymentMethodFallback;
  }
  return 'N/A';
}

/**
 * Infer instrument fields to persist on the order after a successful Worldline payment.
 */
function inferInstrumentFieldsFromWorldline(worldlinePayment) {
  const hints = extractWorldlineHints(worldlinePayment);
  const displayLabel = resolveWorldlineInstrumentLabel(hints);
  let instrument = 'digital';
  const lower = displayLabel.toLowerCase();
  if (lower.includes('phonepe')) instrument = 'phonepe';
  else if (lower.includes('google pay')) instrument = 'gpay';
  else if (lower.includes('paytm')) instrument = 'paytm';
  else if (lower.includes('amazon')) instrument = 'amazon_pay';
  else if (lower.includes('bhim')) instrument = 'bhim';
  else if (lower.includes('net banking')) instrument = 'netbanking';
  else if (lower.includes('credit card')) instrument = 'credit_card';
  else if (lower.includes('debit card')) instrument = 'debit_card';
  else if (lower.includes('card')) instrument = 'card';
  else if (lower.includes('upi')) instrument = 'upi';

  return {
    instrument,
    displayLabel,
    paymentMode: hints.paymentMode || '',
  };
}

function buildEstimatedDeliveryMessage(order) {
  const status = String(order?.status || '').toLowerCase();
  if (['delivered', 'completed'].includes(status)) {
    return 'Your order has been delivered.';
  }
  if (['cancelled', 'canceled'].includes(status)) {
    return '';
  }

  // Always use the configured SLA promise — do not derive from historical
  // estimatedDelivery timestamps (older orders may still have a 45-min window).
  const slaMinutes = Math.max(10, Number(process.env.DEFAULT_DELIVERY_SLA_MINUTES) || 30);
  return `Estimated delivery: Within ${slaMinutes} minutes`;
}

module.exports = {
  METHOD_TYPE_LABELS,
  buildPaymentMethodPresentation,
  resolvePaymentLabel,
  resolveWorldlineInstrumentLabel,
  inferInstrumentFieldsFromWorldline,
  extractWorldlineHints,
  buildEstimatedDeliveryMessage,
  formatInr,
};
