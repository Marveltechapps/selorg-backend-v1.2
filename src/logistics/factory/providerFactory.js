'use strict';

const { createPorterAdapter } = require('../providers/porter.adapter');
const { createShadowfaxAdapter } = require('../providers/shadowfax.adapter');

/**
 * @param {string} name
 */
function getProviderAdapter(name) {
  const n = String(name || '').toUpperCase();
  if (n === 'PORTER') return createPorterAdapter();
  if (n === 'SHADOWFAX') return createShadowfaxAdapter();
  if (n === 'LOADSHARE') return createShadowfaxAdapter(); // stub until real adapter
  return createPorterAdapter();
}

module.exports = { getProviderAdapter };
