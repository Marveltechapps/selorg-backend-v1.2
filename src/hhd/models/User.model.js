const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { USER_ROLE } = require('../utils/constants');

const UserSchema = new mongoose.Schema(
  {
    mobile: {
      type: String,
      required: [true, 'Please add a mobile number'],
      unique: true,
      match: [/^[6-9]\d{9}$/, 'Please add a valid 10-digit mobile number'],
      index: true,
    },
    name: { type: String, trim: true },
    role: {
      type: String,
      enum: Object.values(USER_ROLE),
      default: USER_ROLE.PICKER,
    },
    password: { type: String, select: false },
    isActive: { type: Boolean, default: true },
    deviceId: { type: String },
    lastLogin: { type: Date },
  },
  { timestamps: true, collection: 'hhd_users' }
);

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  if (this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

UserSchema.methods.generateOTP = function () {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

UserSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false;
  return bcrypt.compare(enteredPassword, this.password);
};

UserSchema.methods.getSignedJwtToken = function () {
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET || '', {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

module.exports = mongoose.model('HHDUser', UserSchema);
