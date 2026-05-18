'use strict';

const { v4: uuidv4 } = require('uuid');
const WebhookEvent = require('../models/webhookEvent.model');
const { createPorterAdapter } = require('../providers/porter.adapter');
const { WebhookSignatureError } = require('../utils/errors');
const { publishWebhookReceived } = require('../events/producers/webhookEvent.producer');
const { asyncHandler } = require('../../core/middleware');

function parsePayload(req) {
  if (req.rawBody && Buffer.isBuffer(req.rawBody)) {
    try {
      return JSON.parse(req.rawBody.toString('utf8'));
    } catch (_) {
      return {};
    }
  }
  return req.body || {};
}

const ingestPorter = asyncHandler(async (req, res) => {
  const adapter = createPorterAdapter();
  const buf = req.rawBody && Buffer.isBuffer(req.rawBody)
    ? req.rawBody
    : Buffer.from(JSON.stringify(req.body || {}), 'utf8');
  const sig =
    req.headers['x-porter-signature'] ||
    req.headers['x-logistics-signature'] ||
    req.headers['x-signature'] ||
    '';

  if (!adapter.verifyWebhookSignature(buf, sig)) {
    throw new WebhookSignatureError();
  }

  const payload = parsePayload(req);
  const doc = await WebhookEvent.create({
    provider: 'PORTER',
    payload,
    signature: String(sig).slice(0, 512),
    processed: false,
  });

  const envelope = {
    eventId: uuidv4(),
    eventType: 'webhook.received',
    version: 1,
    timestamp: new Date().toISOString(),
    data: { webhookEventId: doc._id.toString(), provider: 'PORTER' },
  };
  await publishWebhookReceived(envelope);

  res.status(200).json({ success: true, received: true });
});

module.exports = { ingestPorter };
