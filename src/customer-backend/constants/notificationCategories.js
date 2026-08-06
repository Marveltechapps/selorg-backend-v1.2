/**
 * Canonical notification categories for Selorg customer notifications.
 * Used by templates, inbox filtering, preference gating, and analytics.
 */

const CATEGORIES = Object.freeze({
  ORDER: 'order',
  OFFERS: 'offers',
  PROMOTIONAL: 'promotional',
  WALLET: 'wallet',
  SYSTEM: 'system',
  WELCOME: 'welcome',
});

const CATEGORY_LIST = Object.freeze(Object.values(CATEGORIES));

const CATEGORY_LABELS = Object.freeze({
  [CATEGORIES.ORDER]: 'Order Updates',
  [CATEGORIES.OFFERS]: 'Offers & Discounts',
  [CATEGORIES.PROMOTIONAL]: 'Promotional Notifications',
  [CATEGORIES.WALLET]: 'Wallet Notifications',
  [CATEGORIES.SYSTEM]: 'System Notifications',
  [CATEGORIES.WELCOME]: 'Welcome Notifications',
});

/** Channels that can be toggled per category (and globally). */
const CHANNELS = Object.freeze(['push', 'inApp', 'sms', 'whatsapp', 'email']);

const DEFAULT_CATEGORY_CHANNELS = Object.freeze({
  push: true,
  inApp: true,
  sms: true,
  whatsapp: true,
  email: true,
});

/** Map transactional notification type → category. */
const TYPE_TO_CATEGORY = Object.freeze({
  ORDER_PLACED: CATEGORIES.ORDER,
  ORDER_AWAITING_PAYMENT: CATEGORIES.ORDER,
  COD_ORDER_PLACED: CATEGORIES.ORDER,
  WALLET_ORDER_PLACED: CATEGORIES.ORDER,
  ORDER_CONFIRMED: CATEGORIES.ORDER,
  ORDER_PACKED: CATEGORIES.ORDER,
  ORDER_ON_WAY: CATEGORIES.ORDER,
  ORDER_ARRIVED: CATEGORIES.ORDER,
  ORDER_DELIVERED: CATEGORIES.ORDER,
  ORDER_CANCELLED: CATEGORIES.ORDER,
  ORDER_CANCELLED_BY_STORE: CATEGORIES.ORDER,
  DELIVERY_DELAYED: CATEGORIES.ORDER,
  DELIVERY_SLA_BREACH: CATEGORIES.ORDER,
  MISSING_ITEMS: CATEGORIES.ORDER,

  PAYMENT_FAILED: CATEGORIES.ORDER,
  PAYMENT_CANCELLED: CATEGORIES.ORDER,
  PAYMENT_TIMEOUT: CATEGORIES.ORDER,
  PAYMENT_PENDING: CATEGORIES.ORDER,
  PAYMENT_RETRY_AVAILABLE: CATEGORIES.ORDER,
  PAYMENT_SUCCESS: CATEGORIES.ORDER,
  WALLET_PAYMENT_FAILED: CATEGORIES.WALLET,

  REFUND_INITIATED: CATEGORIES.WALLET,
  REFUND_APPROVED: CATEGORIES.WALLET,
  REFUND_COMPLETED: CATEGORIES.WALLET,
  REFUND_REJECTED: CATEGORIES.WALLET,
  WALLET_CREDIT: CATEGORIES.WALLET,
  WALLET_DEBIT: CATEGORIES.WALLET,

  SUPPORT_REPLY: CATEGORIES.SYSTEM,
  SYSTEM_ANNOUNCEMENT: CATEGORIES.SYSTEM,
  WELCOME: CATEGORIES.WELCOME,
  CAMPAIGN: CATEGORIES.PROMOTIONAL,
  NEW_OFFER: CATEGORIES.OFFERS,
  OFFER_CAMPAIGN: CATEGORIES.OFFERS,
  PROMOTIONAL_CAMPAIGN: CATEGORIES.PROMOTIONAL,
});

/** Admin template category aliases → canonical category. */
const TEMPLATE_CATEGORY_MAP = Object.freeze({
  transactional: CATEGORIES.ORDER,
  order: CATEGORIES.ORDER,
  offers: CATEGORIES.OFFERS,
  promotional: CATEGORIES.PROMOTIONAL,
  wallet: CATEGORIES.WALLET,
  system: CATEGORIES.SYSTEM,
  welcome: CATEGORIES.WELCOME,
});

function resolveCategory(typeOrCategory, explicitCategory) {
  if (explicitCategory && CATEGORY_LIST.includes(explicitCategory)) {
    return explicitCategory;
  }
  const raw = String(typeOrCategory || '').trim();
  if (CATEGORY_LIST.includes(raw)) return raw;
  if (TEMPLATE_CATEGORY_MAP[raw]) return TEMPLATE_CATEGORY_MAP[raw];
  if (TYPE_TO_CATEGORY[raw]) return TYPE_TO_CATEGORY[raw];
  const upper = raw.toUpperCase();
  if (TYPE_TO_CATEGORY[upper]) return TYPE_TO_CATEGORY[upper];
  return CATEGORIES.SYSTEM;
}

function defaultCategoriesPreferences() {
  const out = {};
  for (const cat of CATEGORY_LIST) {
    out[cat] = { ...DEFAULT_CATEGORY_CHANNELS };
  }
  return out;
}

module.exports = {
  CATEGORIES,
  CATEGORY_LIST,
  CATEGORY_LABELS,
  CHANNELS,
  DEFAULT_CATEGORY_CHANNELS,
  TYPE_TO_CATEGORY,
  TEMPLATE_CATEGORY_MAP,
  resolveCategory,
  defaultCategoriesPreferences,
};
