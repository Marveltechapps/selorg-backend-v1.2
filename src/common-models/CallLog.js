const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerOrder' },
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminSupportTicket' },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerUser' },
    fromRole: {
      type: String,
      enum: ['customer', 'support_agent', 'rider', 'darkstore_staff'],
      required: true,
    },
    toRole: {
      type: String,
      enum: ['customer', 'support_agent', 'rider', 'darkstore_staff'],
      required: true,
    },
    fromUserId: { type: mongoose.Schema.Types.ObjectId },
    toUserId: { type: mongoose.Schema.Types.ObjectId },
    callerPhone: { type: String },
    calleePhone: { type: String },
    virtualNumber: { type: String },
    isMasked: { type: Boolean, default: false },
    direction: {
      type: String,
      enum: ['inbound', 'outbound'],
      required: true,
    },
    status: {
      type: String,
      enum: ['initiated', 'ringing', 'connected', 'missed', 'failed', 'busy', 'declined'],
      required: true,
    },
    startTime: { type: Date, required: true },
    endTime: { type: Date },
    duration: { type: Number, default: 0 },
    recordingUrl: { type: String },
    agentNotes: { type: String, default: '' },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
  },
  { timestamps: true }
);

callLogSchema.index({ orderId: 1, createdAt: -1 });
callLogSchema.index({ ticketId: 1 });
callLogSchema.index({ customerId: 1, createdAt: -1 });
callLogSchema.index({ fromUserId: 1, createdAt: -1 });

const CallLog =
  mongoose.models.CallLog ||
  mongoose.model('CallLog', callLogSchema);

module.exports = { CallLog };
