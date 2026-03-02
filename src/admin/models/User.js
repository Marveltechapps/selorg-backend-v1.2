const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      index: true,
    },
    role: {
      type: String,
      index: true,
    },
    permissions: [{
      type: String,
    }],
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
      index: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    reportingManagerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    location: [{
      type: String,
    }],
    startDate: {
      type: Date,
    },
    lastLogin: {
      type: Date,
    },
    notes: {
      type: String,
    },
    assignedStores: [{ type: String }],
    primaryStoreId: { type: String },
    metadata: mongoose.Schema.Types.Mixed,
  },
  {
    timestamps: true,
  }
);

// Indexes for common queries
UserSchema.index({ status: 1, roleId: 1 });
UserSchema.index({ email: 1, status: 1 });
UserSchema.index({ department: 1, status: 1 });

UserSchema.set('toJSON', {
  transform: function(doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.models.AdminUser || mongoose.model('AdminUser', UserSchema);
