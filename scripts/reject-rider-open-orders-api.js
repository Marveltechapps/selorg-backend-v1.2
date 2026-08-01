/**
 * Reject/clear all open orders for a rider using the currently running backend.
 * Does not require a backend restart.
 * Usage: node scripts/reject-rider-open-orders-api.js [riderId]
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');

const riderId = process.argv[2] || 'RDR-ADY-2604-004';
const base = process.env.API_BASE_URL || 'http://localhost:3333';

function getSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  try {
    return require('../src/rider_v2_backend/src/config/env.js').env.JWT_SECRET;
  } catch (_) {
    return null;
  }
}

(async () => {
  const secret = getSecret();
  if (!secret) {
    console.error('JWT_SECRET missing');
    process.exit(1);
  }
  const token = jwt.sign({ sub: riderId, phoneNumber: '0000000000', name: 'Cleanup' }, secret, {
    expiresIn: '15m',
  });
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const listRes = await fetch(`${base}/api/v1/orders/admin/orders?limit=50`, { headers });
  const listBody = await listRes.json().catch(() => ({}));
  const orders = listBody.orders || [];
  console.log('Open/listed orders:', listRes.status, orders.length);
  orders.forEach((o) => console.log(' -', o._id, o.orderNumber, o.status));

  let cleared = 0;
  for (const o of orders) {
    const id = o._id;
    // Prefer reject (unassigns). If that fails, try setting via deliver is wrong — just reject.
    const res = await fetch(`${base}/api/v1/orders/${id}/reject`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: 'cleared_test_open_order' }),
    });
    const body = await res.json().catch(() => ({}));
    console.log('reject', id, res.status, body.error || body.message || 'ok');
    if (res.ok) cleared += 1;
  }

  const afterRes = await fetch(`${base}/api/v1/orders/admin/orders?limit=50`, { headers });
  const afterBody = await afterRes.json().catch(() => ({}));
  console.log('After:', afterRes.status, 'count=', afterBody.count, 'cleared=', cleared);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
