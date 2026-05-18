'use strict';

/**
 * Internal canonical enums (mirror these in frontend types).
 * @typedef {'VENDOR_TO_WAREHOUSE'|'WAREHOUSE_TO_DARKSTORE'} InternalOrderType
 * @typedef {'PORTER'|'SHADOWFAX'|'LOADSHARE'} ProviderName
 * @typedef {'CREATED'|'DRIVER_ASSIGNED'|'PICKED_UP'|'IN_TRANSIT'|'DELIVERED'|'CANCELLED'|'FAILED'} InternalOrderStatus
 *
 * @typedef {Object} InternalLocation
 * @property {string} name
 * @property {string} phone
 * @property {string} address
 * @property {number} lat
 * @property {number} lng
 *
 * @typedef {Object} InternalItem
 * @property {string} name
 * @property {number} quantity
 * @property {number} [weight]
 *
 * @typedef {Object} InternalOrderPayload
 * @property {string} referenceId
 * @property {InternalOrderType} type
 * @property {ProviderName} provider
 * @property {InternalLocation} pickup
 * @property {InternalLocation} drop
 * @property {InternalItem[]} items
 * @property {string} [vehicleType]
 * @property {Date|string} [scheduledTime]
 *
 * @typedef {Object} ProviderOrderResponse
 * @property {string} providerOrderId
 * @property {InternalOrderStatus} status
 * @property {number} [estimatedFare]
 * @property {number} [distanceKm]
 * @property {Object} rawRequest
 * @property {Object} rawResponse
 *
 * @typedef {Object} CancelResponse
 * @property {boolean} ok
 * @property {Object} [raw]
 *
 * @typedef {Object} TrackingLocation
 * @property {number} lat
 * @property {number} lng
 * @property {string} [updatedAt]
 *
 * @typedef {Object} TrackingResponse
 * @property {InternalOrderStatus} status
 * @property {TrackingLocation[]} [path]
 * @property {Object} [driver]
 * @property {Object} raw
 *
 * @typedef {Object} FareEstimatePayload
 * @property {InternalLocation} pickup
 * @property {InternalLocation} drop
 * @property {InternalItem[]} items
 * @property {string} [vehicleType]
 *
 * @typedef {Object} FareEstimateResponse
 * @property {number} [fare]
 * @property {number} [distanceKm]
 * @property {Object} raw
 */

module.exports = {};
