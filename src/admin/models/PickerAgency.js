const mongoose = require('mongoose');

const PickerAgencySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    contactPerson: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'picker_agencies' }
);

PickerAgencySchema.index({ name: 1 });

module.exports = mongoose.models.PickerAgency || mongoose.model('PickerAgency', PickerAgencySchema);

