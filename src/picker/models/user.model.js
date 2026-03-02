/**
 * User model – from frontend YAML (application-spec / backend-workflow).
 * Fields: phone, email, name, age, gender, photoUri, locationType, selectedShifts, trainingProgress, upiId, upiName.
 * Uses collection 'picker_users' so the shared DB can hold both HHD users (users) and Picker users (picker_users).
 * hhdUserId links this picker to HHD User for "orders to order complete" in the shared DB.
 */
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true },
    email: { type: String },
    name: { type: String },
    age: { type: Number },
    gender: { type: String, enum: ['male', 'female'] },
    photoUri: { type: String },
    locationType: { type: String, enum: ['warehouse', 'darkstore'] },
    selectedShifts: [{ id: String, name: String, time: String }],
    trainingProgress: {
      video1: { type: Number, default: 0 },
      video2: { type: Number, default: 0 },
      video3: { type: Number, default: 0 },
      video4: { type: Number, default: 0 },
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
  },
  { timestamps: true, collection: 'picker_users' }
);

// Model name 'PickerUser' to avoid overwriting HHD's 'User' in unified backend
module.exports = mongoose.model('PickerUser', userSchema);
