const mongoose = require('mongoose');

const incentiveCriteriaSchema = new mongoose.Schema(
  {
    criterion: {
      type: String,
      required: true,
    },
    reward: {
      type: String,
      required: true,
    },
    store_id: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

incentiveCriteriaSchema.index({ store_id: 1 });

module.exports = mongoose.models.IncentiveCriteria || mongoose.model('IncentiveCriteria', incentiveCriteriaSchema);

