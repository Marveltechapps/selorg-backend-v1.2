const mongoose = require('mongoose');
const { Schema } = mongoose;

const timeSlotSchema = new Schema({
  start: { type: String, default: '' },
  end: { type: String, default: '' },
  days: [{ type: String }],
}, { _id: false });

const SurgeRuleSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  type: {
    type: String,
    required: true,
    enum: ['time_based', 'demand_based', 'zone_based', 'event_based'],
  },
  multiplier: { type: Number, required: true, min: 1, max: 5 },
  conditions: {
    timeSlots: [timeSlotSchema],
    zones: [{ type: Schema.Types.ObjectId, ref: 'Zone' }],
    demandThreshold: { type: Number },
    eventType: { type: String },
  },
  applicableCategories: [{ type: String }],
  applicableProducts: [{ type: String }],
  priority: { type: Number, default: 1 },
  status: {
    type: String,
    required: true,
    enum: ['active', 'inactive', 'scheduled'],
    default: 'active',
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, default: null },
}, { timestamps: true, collection: 'surge_rules' });

SurgeRuleSchema.index({ status: 1 });
SurgeRuleSchema.index({ type: 1 });
SurgeRuleSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.models.SurgeRule || mongoose.model('SurgeRule', SurgeRuleSchema);
