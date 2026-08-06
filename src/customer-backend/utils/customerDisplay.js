const GENERIC_NAMES = new Set(['customer', 'unknown', 'user', '']);

/** Synthetic emails assigned historically to phone-only OTP users. */
const PLACEHOLDER_EMAIL_RE = /^no-email-.*@no-email\.selorg$/i;

function formatPhoneForDisplay(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (digits.length > 10) return `+${digits}`;
  return String(phone || '').trim();
}

function isPlaceholderCustomerEmail(email) {
  if (email == null) return true;
  const trimmed = String(email).trim();
  if (!trimmed) return true;
  if (PLACEHOLDER_EMAIL_RE.test(trimmed)) return true;
  if (trimmed.includes('no-email')) return true;
  if (trimmed.startsWith('customer-') && trimmed.endsWith('@selorg.com')) return true;
  return false;
}

/**
 * Return a real customer email, or empty string when missing / placeholder.
 * Never invents a fake address for API clients.
 */
function sanitizeCustomerEmail(email) {
  if (isPlaceholderCustomerEmail(email)) return '';
  return String(email).trim();
}

/**
 * Resolve how a customer should appear in support / live chat UIs.
 * Prefers real name, then formatted phone, then short id suffix.
 */
function resolveCustomerIdentity({ user, ticket } = {}) {
  const rawName =
    (user?.name && String(user.name).trim()) ||
    (user?.savedCheckoutContact?.fullName && String(user.savedCheckoutContact.fullName).trim()) ||
    (ticket?.customerName && String(ticket.customerName).trim()) ||
    '';

  const phone =
    (user?.phoneNumber && String(user.phoneNumber).trim()) ||
    (user?.savedCheckoutContact?.phone && String(user.savedCheckoutContact.phone).trim()) ||
    (ticket?.customerPhone && String(ticket.customerPhone).trim()) ||
    '';

  const isGeneric = !rawName || GENERIC_NAMES.has(rawName.toLowerCase());

  let displayName = !isGeneric ? rawName : '';
  if (!displayName && phone) displayName = formatPhoneForDisplay(phone);
  if (!displayName && ticket?.customerId) {
    displayName = `Customer ···${String(ticket.customerId).slice(-6)}`;
  }
  if (!displayName) displayName = 'Customer';

  const customerName = !isGeneric ? rawName : displayName;

  return {
    customerName,
    displayName,
    customerPhone: phone,
  };
}

function isGenericCustomerName(name) {
  return !name || GENERIC_NAMES.has(String(name).trim().toLowerCase());
}

module.exports = {
  GENERIC_NAMES,
  PLACEHOLDER_EMAIL_RE,
  formatPhoneForDisplay,
  isPlaceholderCustomerEmail,
  sanitizeCustomerEmail,
  resolveCustomerIdentity,
  isGenericCustomerName,
};
