/** Selorg finance chart of accounts (Indian quick-commerce). */
const DEFAULT_ACCOUNTS = [
  { code: '1100', name: 'Cash & Bank', type: 'asset' },
  { code: '1110', name: 'Accounts Receivable', type: 'asset' },
  { code: '2100', name: 'Accounts Payable', type: 'liability' },
  { code: '2200', name: 'Customer Wallet Liability', type: 'liability' },
  { code: '4100', name: 'Sales Revenue', type: 'revenue' },
  { code: '5100', name: 'Vendor & COGS Expense', type: 'expense' },
  { code: '5200', name: 'Refunds & Returns', type: 'expense' },
];

const ACCOUNT_BY_CODE = Object.fromEntries(DEFAULT_ACCOUNTS.map((a) => [a.code, a]));

function accountName(code) {
  return ACCOUNT_BY_CODE[code]?.name || 'Unknown Account';
}

function isDebitNormal(type) {
  return type === 'asset' || type === 'expense';
}

module.exports = {
  DEFAULT_ACCOUNTS,
  ACCOUNT_BY_CODE,
  accountName,
  isDebitNormal,
};
