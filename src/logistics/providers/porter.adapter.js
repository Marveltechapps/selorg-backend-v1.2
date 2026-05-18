'use strict';

const crypto = require('crypto');
const { getConfig } = require('../config/env');
const logger = require('../utils/logger');
const { ProviderError } = require('../utils/errors');

// TODO(porter-contract): Replace paths and field names with official Porter B2B bulk docs.

const STATUS_MAP = {
  open: 'CREATED',
  created: 'CREATED',
  pending: 'CREATED',
  assigned: 'DRIVER_ASSIGNED',
  driver_assigned: 'DRIVER_ASSIGNED',
  accepted: 'DRIVER_ASSIGNED',
  picked_up: 'PICKED_UP',
  picked: 'PICKED_UP',
  in_transit: 'IN_TRANSIT',
  otw: 'IN_TRANSIT',
  completed: 'DELIVERED',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  failed: 'FAILED',
};

function mapStatus(providerStatus) {
  if (!providerStatus) return 'CREATED';
  const key = String(providerStatus).toLowerCase().replace(/\s+/g, '_');
  return STATUS_MAP[key] || 'IN_TRANSIT';
}

function toPorterOrderPayload(internal) {
  return {
    reference_id: internal.referenceId,
    pickup_details: {
      name: internal.pickup.name,
      phone: internal.pickup.phone,
      address: internal.pickup.address,
      latitude: internal.pickup.lat,
      longitude: internal.pickup.lng,
    },
    drop_details: {
      name: internal.drop.name,
      phone: internal.drop.phone,
      address: internal.drop.address,
      latitude: internal.drop.lat,
      longitude: internal.drop.lng,
    },
    items: (internal.items || []).map((i) => ({
      item_name: i.name,
      quantity: i.quantity,
      weight: i.weight ?? 0,
    })),
    vehicle_type: internal.vehicleType || 'mini_truck',
    order_type: internal.type,
  };
}

function verifyHmacBody(payloadBuffer, signatureHeader, secret) {
  if (!secret || !signatureHeader || !payloadBuffer) return false;
  try {
    const h = crypto.createHmac('sha256', secret).update(payloadBuffer).digest('hex');
    const expectedBuf = Buffer.from(h, 'utf8');
    const got = String(signatureHeader).trim();
    // support "sha256=<hex>" or raw hex
    const hex = got.includes('=') ? got.split('=').pop() : got;
    const sigBuf = Buffer.from(hex, 'utf8');
    if (sigBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  } catch (_) {
    return false;
  }
}

function createPorterAdapter() {
  const cfg = getConfig();

  async function httpJson(method, path, body) {
    const url = `${cfg.PORTER_API_BASE_URL.replace(/\/$/, '')}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (cfg.PORTER_API_KEY) {
      headers.Authorization = `Bearer ${cfg.PORTER_API_KEY}`;
    }
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), cfg.LOGISTICS_FAILOVER_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (_) {
        json = { raw: text };
      }
      if (!res.ok) {
        logger.warn('[porter] http error', { status: res.status, path });
        throw new ProviderError(`Porter HTTP ${res.status}`, {
          provider: 'PORTER',
          statusCode: res.status >= 400 && res.status < 600 ? res.status : 502,
          details: json,
        });
      }
      return json;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      logger.error('[porter] request failed', { error: err.message, path });
      throw new ProviderError(err.message || 'Porter request failed', { provider: 'PORTER' });
    } finally {
      clearTimeout(t);
    }
  }

  return {
    name: 'PORTER',

    mapStatus,

    verifyWebhookSignature(payload, signature) {
      const secret = cfg.PORTER_HMAC_SECRET || '';
      const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload), 'utf8');
      return verifyHmacBody(buf, signature, secret);
    },

    async createOrder(payload) {
      const rawRequest = toPorterOrderPayload(payload);
      // TODO(porter-contract): confirm create path
      const json = await httpJson('POST', '/v1/partner/orders', rawRequest);
      const providerOrderId = json?.order_id || json?.id || json?.data?.order_id;
      if (!providerOrderId) {
        throw new ProviderError('Porter response missing order id', {
          provider: 'PORTER',
          details: json,
        });
      }
      const status = mapStatus(json?.status || json?.order_status || 'created');
      return {
        providerOrderId: String(providerOrderId),
        status,
        estimatedFare: Number(json?.fare || json?.estimated_fare || 0) || undefined,
        distanceKm: Number(json?.distance_km || json?.estimated_distance_km || 0) || undefined,
        rawRequest,
        rawResponse: json,
      };
    },

    async cancelOrder(providerOrderId) {
      const rawRequest = { order_id: providerOrderId };
      const json = await httpJson('POST', `/v1/partner/orders/${encodeURIComponent(providerOrderId)}/cancel`, rawRequest);
      return { ok: Boolean(json?.success ?? json?.cancelled ?? true), raw: json };
    },

    async trackOrder(providerOrderId) {
      const json = await httpJson(
        'GET',
        `/v1/partner/orders/${encodeURIComponent(providerOrderId)}/track`,
        null
      );
      const status = mapStatus(json?.status || json?.order_status);
      const loc = json?.driver_location || json?.location;
      const path = [];
      if (loc && typeof loc.lat === 'number') {
        path.push({ lat: loc.lat, lng: loc.lng, updatedAt: new Date().toISOString() });
      }
      return {
        status,
        path,
        driver: json?.driver || json?.driver_details,
        raw: json,
      };
    },

    async getFareEstimate(payload) {
      const internal = {
        referenceId: 'estimate',
        type: 'VENDOR_TO_WAREHOUSE',
        provider: 'PORTER',
        pickup: payload.pickup,
        drop: payload.drop,
        items: payload.items,
        vehicleType: payload.vehicleType,
      };
      const body = toPorterOrderPayload(internal);
      const json = await httpJson('POST', '/v1/partner/orders/estimate', body);
      return {
        fare: Number(json?.fare || json?.estimated_fare || 0) || undefined,
        distanceKm: Number(json?.distance_km || 0) || undefined,
        raw: json,
      };
    },
  };
}

module.exports = { createPorterAdapter, mapStatus, verifyWebhookSignature: verifyHmacBody, STATUS_MAP };
