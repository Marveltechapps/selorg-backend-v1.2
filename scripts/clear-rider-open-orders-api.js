/**
 * Clears open (active) orders for a rider via the running backend API.
 * Usage: node scripts/clear-rider-open-orders-api.js [riderId]
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');

const riderId = process.argv[2] || 'RDR-ADY-2604-004';
const base = process.env.API_BASE_URL || process.env.BACKEND_URL || 'http://localhost:3333';

// Prefer rider_v2 JWT secret used by authenticate middleware
let secret =
  process.env.JWT_SECRET ||
  process.env.RIDER_JWT_SECRET ||
  process.env.TOKEN_SECRET;

async function loadSecretFromRiderEnv() {
  if (secret) return secret;
  try {
    const envMod = require('../src/rider_v2_backend/src/config/env.js');
    if (envMod && envMod.env && envMod.env.JWT_SECRET) return envMod.env.JWT_SECRET;
  } catch (_) {}
  return null;
}

(async () => {
  secret = await loadSecretFromRiderEnv();
  if (!secret) {
    console.error('JWT_SECRET not found in env');
    process.exit(1);
  }

  const token = jwt.sign(
    { sub: riderId, phoneNumber: '0000000000', name: 'Clear Script' },
    secret,
    { expiresIn: '10m' }
  );

  const listRes = await fetch(`${base}/api/v1/orders/admin/orders?limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listBody = await listRes.json().catch(() => ({}));
  console.log('Before clear:', listRes.status, 'count=', listBody.count, 'orders=', (listBody.orders || []).map((o) => ({
    id: o._id,
    orderNumber: o.orderNumber,
    status: o.status,
  })));

  const clearRes = await fetch(`${base}/api/v1/orders/admin/orders/clear-open`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const clearBody = await clearRes.json().catch(() => ({}));
  console.log('Clear result:', clearRes.status, clearBody);

  const afterRes = await fetch(`${base}/api/v1/orders/admin/orders?limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const afterBody = await afterRes.json().catch(() => ({}));
  console.log('After clear:', afterRes.status, 'count=', afterBody.count);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
