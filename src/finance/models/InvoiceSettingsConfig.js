const mongoose = require('mongoose');

const InvoiceSettingsConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      default: 'default',
    },
    autoGenerate: {
      type: Boolean,
      default: true,
    },
    invoicePrefix: {
      type: String,
      default: 'QC-INV',
      trim: true,
    },
    invoiceNumberFormat: {
      type: String,
      default: 'PREFIX-YYYY-NNNNNN',
      trim: true,
    },
    startingNumber: {
      type: Number,
      default: 100000,
      min: 0,
    },
    includeGST: {
      type: Boolean,
      default: true,
    },
    includeTDS: {
      type: Boolean,
      default: false,
    },
    paymentTerms: {
      type: String,
      default: 'NET 30',
      trim: true,
    },
    notesTemplate: {
      type: String,
      default: 'Thank you for your business!',
    },
    footerText: {
      type: String,
      default: 'Terms and conditions apply.',
    },
  },
  {
    timestamps: true,
    collection: 'invoicesettingsconfigs',
  }
);

const DOC_KEY = 'default';

InvoiceSettingsConfigSchema.statics.getConfig = async function () {
  let doc = await this.findOne({ key: DOC_KEY }).lean();
  if (!doc) {
    const created = await this.create({
      key: DOC_KEY,
      autoGenerate: true,
      invoicePrefix: 'QC-INV',
      invoiceNumberFormat: 'PREFIX-YYYY-NNNNNN',
      startingNumber: 100000,
      includeGST: true,
      includeTDS: false,
      paymentTerms: 'NET 30',
      notesTemplate: 'Thank you for your business!',
      footerText: 'Terms and conditions apply.',
    });
    doc = created.toObject();
  }
  return doc;
};

InvoiceSettingsConfigSchema.statics.updateConfig = async function (data) {
  const doc = await this.findOneAndUpdate(
    { key: DOC_KEY },
    { $set: data },
    { new: true, upsert: true, runValidators: true }
  ).lean();
  return doc;
};

module.exports = mongoose.models.InvoiceSettingsConfig || mongoose.model('InvoiceSettingsConfig', InvoiceSettingsConfigSchema);
