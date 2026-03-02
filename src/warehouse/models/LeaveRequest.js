const mongoose = require('mongoose');

const LeaveRequestSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  staffId: { type: String, required: true, index: true },
  staffName: { type: String, required: true },
  leaveType: { type: String, enum: ['sick', 'casual', 'emergency', 'vacation'], required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  days: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reason: { type: String, default: '' }
}, { timestamps: true, collection: 'staff_leave_requests' });

module.exports = mongoose.models.LeaveRequest || mongoose.model('LeaveRequest', LeaveRequestSchema);


