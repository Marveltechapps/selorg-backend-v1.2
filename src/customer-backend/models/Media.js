const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema(
  {
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerSite', default: null },
    type: { type: String, enum: ['image', 'video'], default: 'image' },
    url: { type: String, required: true },
    altText: String,
    width: Number,
    height: Number,
    fileSize: Number,
  },
  { timestamps: true }
);

mediaSchema.index({ siteId: 1 });
mediaSchema.index({ type: 1 });

const Media = mongoose.models.CustomerMedia || mongoose.model('CustomerMedia', mediaSchema, 'customer_media');
module.exports = { Media };
