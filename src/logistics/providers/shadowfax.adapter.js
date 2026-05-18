'use strict';

const { NotImplementedError } = require('../utils/errors');

function createShadowfaxAdapter() {
  const reject = () => {
    throw new NotImplementedError('Shadowfax logistics adapter not implemented yet');
  };
  return {
    name: 'SHADOWFAX',
    mapStatus: () => 'CREATED',
    verifyWebhookSignature: () => false,
    createOrder: reject,
    cancelOrder: reject,
    trackOrder: reject,
    getFareEstimate: reject,
  };
}

module.exports = { createShadowfaxAdapter };
