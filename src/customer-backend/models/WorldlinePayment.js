const mongoose = require('mongoose');

const worldlinePaymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerUser', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerOrder', required: true },

    idempotencyKey: { type: String, required: true },

    merchantId: { type: String, required: true },
    schemeCode: { type: String, required: true }, // itemId in Paynimo request (e.g. FIRST)

    platform: { type: String, enum: ['android', 'ios'], required: true },
    deviceId: { type: String, enum: ['AndroidSH1', 'AndroidSH2', 'iOSSH1', 'iOSSH2'], required: true },

    txnId: { type: String, required: true }, // merchant txn id
    attemptNo: { type: Number, default: 1 },
    amountInr: { type: Number, required: true },
    currency: { type: String, default: 'INR' },

    status: {
      type: String,
      enum: ['created', 'initiated', 'success', 'failed', 'cancelled', 'pending', 'unknown'],
      default: 'created',
      index: true,
    },
    statusCode: { type: String, default: '' },
    statusMessage: { type: String, default: '' },

    verificationSource: { type: String, enum: ['app_complete', 'gateway_return', 'reconciliation', 'none'], default: 'none' },
    verificationError: { type: String, enum: ['hash_mismatch', 'amount_mismatch', 'none'], default: 'none' },

    sessionExpiresAt: { type: Date },
    tpslTxnId: { type: String, default: '' },
    bankTxnId: { type: String, default: '' },
    tpslBankCd: { type: String, default: '' },
    tpslTxnTime: { type: String, default: '' },

    token: { type: String, default: '' }, // request hash token
    responseHash: { type: String, default: '' },

    rawSessionRequest: { type: Object, default: null },
    rawGatewayResponse: { type: Object, default: null },
    rawGatewayReturn: { type: Object, default: null },
  },
  { timestamps: true }
);

worldlinePaymentSchema.index({ userId: 1, orderId: 1, createdAt: -1 });
worldlinePaymentSchema.index({ orderId: 1, attemptNo: 1 }, { unique: true });
worldlinePaymentSchema.index({ txnId: 1 }, { unique: true });
worldlinePaymentSchema.index({ idempotencyKey: 1 }); // no longer unique across attempts if we reuse same key structure

const WorldlinePayment =
  mongoose.models.WorldlinePayment ||
  mongoose.model('WorldlinePayment', worldlinePaymentSchema, 'worldline_payments');

module.exports = { WorldlinePayment };

