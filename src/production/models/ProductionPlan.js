const mongoose = require('mongoose');

const productionPlanSchema = new mongoose.Schema(
  {
    product: { type: String, required: true },
    line: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    quantity: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['scheduled', 'in-progress', 'completed'], default: 'scheduled' },
  },
  { timestamps: true }
);

productionPlanSchema.index({ status: 1 });
productionPlanSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.models.ProductionPlan || mongoose.model('ProductionPlan', productionPlanSchema, 'prod_planning_schedule');
