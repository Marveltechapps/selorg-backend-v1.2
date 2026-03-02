const mongoose = require('mongoose');

const RoleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    roleType: {
      type: String,
      enum: ['system', 'custom'],
      default: 'custom',
      index: true,
    },
    permissions: [{
      type: String,
      required: true,
    }],
    accessScope: {
      type: String,
      enum: ['global', 'zone', 'store'],
      default: 'global',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    metadata: mongoose.Schema.Types.Mixed,
  },
  {
    timestamps: true,
  }
);

// Index for common queries
RoleSchema.index({ roleType: 1, isActive: 1 });
RoleSchema.index({ accessScope: 1, isActive: 1 });

// Virtual for user count (will be populated from User model)
RoleSchema.virtual('userCount', {
  ref: 'User',
  localField: '_id',
  foreignField: 'roleId',
  count: true,
});

RoleSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.models.Role || mongoose.model('Role', RoleSchema);
