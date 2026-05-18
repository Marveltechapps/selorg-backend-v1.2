const mongoose = require('mongoose');

const buttonSchema = new mongoose.Schema(
  {
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerSite', default: null },
    buttonId: { type: String, default: '' },
    name: { type: String, required: true },
    label: { type: String, default: '' },
    type: { type: String, enum: ['nav', 'action', 'link', 'section', 'other'], default: 'other' },
    action: { type: String, default: '' },
    icon: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    sectionCode: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    rawDetail: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

buttonSchema.index({ buttonId: 1 }, { sparse: true });
buttonSchema.index({ isActive: 1, order: 1 });
buttonSchema.index({ sectionCode: 1 });

const Button = mongoose.models.CustomerButton || mongoose.model('CustomerButton', buttonSchema, 'customer_buttons');
module.exports = { Button };
