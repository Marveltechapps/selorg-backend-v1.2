const mongoose = require('mongoose');

const FinancialYearConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      default: 'default',
    },
    startMonth: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    startDay: {
      type: Number,
      required: true,
      min: 1,
      max: 31,
    },
    currentYear: {
      type: String,
      required: true,
      trim: true,
    },
    lockPreviousYears: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: 'financialyearconfigs',
  }
);

const DOC_KEY = 'default';

FinancialYearConfigSchema.statics.getConfig = async function () {
  let doc = await this.findOne({ key: DOC_KEY }).lean();
  if (!doc) {
    const created = await this.create({
      key: DOC_KEY,
      startMonth: 4,
      startDay: 1,
      currentYear: '2024-2025',
      lockPreviousYears: true,
    });
    doc = created.toObject();
  }
  return doc;
};

FinancialYearConfigSchema.statics.updateConfig = async function (data) {
  const doc = await this.findOneAndUpdate(
    { key: DOC_KEY },
    { $set: data },
    { new: true, upsert: true, runValidators: true }
  ).lean();
  return doc;
};

module.exports = mongoose.models.FinancialYearConfig || mongoose.model('FinancialYearConfig', FinancialYearConfigSchema);
