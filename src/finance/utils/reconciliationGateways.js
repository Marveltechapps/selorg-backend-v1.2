/** Payment gateways used in Selorg finance (matches LiveTransaction.gateway). */
const RECON_GATEWAYS = {
  worldline: {
    id: 'worldline',
    label: 'Worldline',
    liveGateway: 'worldline',
  },
  cod: {
    id: 'cod',
    label: 'Cash on Delivery',
    liveGateway: 'cod',
  },
};

function normalizeGatewayKey(input) {
  const key = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (RECON_GATEWAYS[key]) return key;
  if (key === 'cash_on_delivery' || key === 'cash') return 'cod';
  return key;
}

function gatewayLabel(key) {
  return RECON_GATEWAYS[normalizeGatewayKey(key)]?.label || key;
}

function listGatewayKeys() {
  return Object.keys(RECON_GATEWAYS);
}

module.exports = {
  RECON_GATEWAYS,
  normalizeGatewayKey,
  gatewayLabel,
  listGatewayKeys,
};
