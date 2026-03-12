"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.getAppConfig = void 0;

/**
 * Returns rider app config. Values can be overridden via env vars.
 * Dashboard can later manage these via a Config collection.
 */
function getAppConfig() {
  return {
    cashLimit: parseInt(process.env.RIDER_CASH_LIMIT || "2000", 10),
    depositMaxAmount: parseInt(process.env.RIDER_DEPOSIT_MAX_AMOUNT || "2450", 10),
    maxWithdrawalsPerDay: parseInt(process.env.RIDER_MAX_WITHDRAWALS_PER_DAY || "2", 10),
    orderListLimit: parseInt(process.env.RIDER_ORDER_LIST_LIMIT || "100", 10),
    payoutListLimit: parseInt(process.env.RIDER_PAYOUT_LIST_LIMIT || "20", 10),
    supportPhone: process.env.RIDER_SUPPORT_PHONE || "1800-123-4567",
    supportEmail: process.env.RIDER_SUPPORT_EMAIL || "support@selorg.com",
    privacyEmail: process.env.RIDER_PRIVACY_EMAIL || "privacy@selorg.com",
    legalEmail: process.env.RIDER_LEGAL_EMAIL || "legal@selorg.com",
    supportSlaMessage: process.env.RIDER_SUPPORT_SLA || "24–48 hours",
    defaultHubName: process.env.RIDER_DEFAULT_HUB_NAME || "Hub",
    vehicleTypes: (process.env.RIDER_VEHICLE_TYPES || "Bike,Scooter,EV,Cycle").split(",").map((s) => s.trim()),
  };
}

exports.getAppConfig = getAppConfig;
