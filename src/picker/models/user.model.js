/**
 * User model – from frontend YAML (application-spec / backend-workflow).
 * Fields: phone, email, name, age, gender, photoUri, locationType, selectedShifts, trainingProgress, upiId, upiName.
 * Uses collection 'picker_users' so the shared DB can hold both HHD users (users) and Picker users (picker_users).
 * hhdUserId links this picker to HHD User for "orders to order complete" in the shared DB.
 */
const mongoose = require('mongoose');
const { PICKER_STATUS } = require('../../constants/pickerEnums');

const userSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true },
    /** Picker onboarding/employment status. New users default to PENDING. */
    status: { type: String, enum: Object.values(PICKER_STATUS), default: PICKER_STATUS.PENDING },
    /** Reason for rejection when status is REJECTED. */
    rejectedReason: { type: String },
    /** When the picker was rejected. */
    rejectedAt: { type: Date },
    /** When the picker was approved (status -> ACTIVE). */
    approvedAt: { type: Date },
    /** Admin user who approved the picker (ObjectId of admin/dashboard user). */
    approvedBy: { type: mongoose.Schema.Types.ObjectId },
    email: { type: String },
    name: { type: String },
    age: { type: Number },
    gender: { type: String, enum: ['male', 'female'] },
    photoUri: { type: String },
    locationType: { type: String, enum: ['warehouse', 'darkstore'] },
    selectedShifts: [{ id: String, name: String, time: String }],
    trainingProgress: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({ video1: 0, video2: 0, video3: 0, video4: 0 }),
    },
    trainingCompleted: { type: Boolean, default: false },
    trainingCompletedAt: { type: Date },
    currentLocationId: { type: String }, // Current work location ID
    lastKnownLocation: {
      latitude: { type: Number },
      longitude: { type: Number },
      timestamp: { type: Date }
    },
    upiId: { type: String },
    upiName: { type: String },
    /** When using shared DB: HHD User _id (users collection) for orders-to-order-complete flow. No ref – other app’s collection. */
    hhdUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
    contractInfo: {
      legalName: { type: String },
      contractStartDate: { type: Date },
      documentId: { type: String },
    },
    employment: {
      joiningDate: { type: Date },
      role: { type: String },
      shiftType: { type: String },
      employerName: { type: String },
      employeeId: { type: String },
      department: { type: String },
    },
    /** Heartbeat/presence – updated by HHD device. Offline when now - lastSeenAt > 60s */
    lastSeenAt: { type: Date },
    batteryLevel: { type: Number }, // 0-100
    activeOrderId: { type: String },
    /** True when picker has started break (from shifts/start-break) */
    onBreak: { type: Boolean, default: false },
    gpsLocation: {
      latitude: { type: Number },
      longitude: { type: Number },
      timestamp: { type: Date },
    },
  },
  { timestamps: true, collection: 'picker_users' }
);

// Model name 'PickerUser' to avoid overwriting HHD's 'User' in unified backend
module.exports = mongoose.model('PickerUser', userSchema);
