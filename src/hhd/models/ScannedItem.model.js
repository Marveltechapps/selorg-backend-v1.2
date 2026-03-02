const mongoose = require('mongoose');

const ScannedItemSchema = new mongoose.Schema(
  {
    barcodeData: { type: String, required: true, index: true },
    barcodeType: {
      type: String,
      required: true,
      enum: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc', 'other'],
      default: 'other',
    },
    orderId: { type: String, index: true },
    userId: { type: String, index: true },
    deviceId: { type: String, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    scannedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, collection: 'hhd_scanned_items' }
);

ScannedItemSchema.index({ barcodeData: 1, scannedAt: -1 });
ScannedItemSchema.index({ orderId: 1, scannedAt: -1 });
ScannedItemSchema.index({ userId: 1, scannedAt: -1 });
ScannedItemSchema.index({ deviceId: 1, scannedAt: -1 });

module.exports = mongoose.model('HHDScannedItem', ScannedItemSchema);
