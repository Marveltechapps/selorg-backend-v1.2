const mongoose = require('mongoose');

const flowConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

flowConfigSchema.index({ key: 1 });

const FlowConfig = mongoose.models.CustomerFlowConfig || mongoose.model('CustomerFlowConfig', flowConfigSchema, 'customer_flow_configs');
module.exports = { FlowConfig };
