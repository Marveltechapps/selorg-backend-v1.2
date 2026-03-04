/**
 * Picker Action Log – audit trail for picker/HHD actions.
 * Schema: { actionType, pickerId, orderId?, timestamp, metadata: {} }
 */
const mongoose = require('mongoose');

const pickerActionLogSchema = new mongoose.Schema(
  {
    actionType: { type: String, required: true },
    pickerId: { type: String, required: true },
    orderId: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'picker_action_logs' }
);

pickerActionLogSchema.index({ pickerId: 1, timestamp: -1 });
pickerActionLogSchema.index({ orderId: 1, timestamp: -1 });
pickerActionLogSchema.index({ actionType: 1, timestamp: -1 });

module.exports =
  mongoose.models.PickerActionLog || mongoose.model('PickerActionLog', pickerActionLogSchema);
