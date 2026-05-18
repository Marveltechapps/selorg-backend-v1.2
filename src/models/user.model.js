/**
 * User Model
 * File: src/models/user.model.js
 *
 * P2.2: User with explicit type discriminator
 * Prevents ambiguity between customer users, picker users, rider users
 */

const mongoose = require('mongoose');

const USER_TYPES = {
  CUSTOMER: 'CUSTOMER',
  PICKER: 'PICKER',
  RIDER: 'RIDER',
  ADMIN: 'ADMIN'
};

const userSchema = new mongoose.Schema(
  {
    // P2.2: Type discriminator - identifies what type of user this is
    userType: {
      type: String,
      enum: Object.values(USER_TYPES),
      required: true,
      index: true // Index for fast role-based queries
    },

    // Authentication
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    password: {
      type: String,
      required: true
    },

    // Profile
    name: {
      type: String,
      required: true
    },
    phone: String,
    profilePicture: String,

    // Status
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    verifiedAt: Date,

    // Service-specific fields
    pickerInfo: {
      documentsVerified: Boolean,
      kycStatus: {
        type: String,
        enum: ['PENDING', 'VERIFIED', 'REJECTED'],
        default: 'PENDING'
      },
      bankAccount: {
        accountHolder: String,
        accountNumber: String,
        routingNumber: String
      },
      walletBalance: {
        type: Number,
        default: 0
      }
    },

    riderInfo: {
      vehicleType: String,
      vehicleNumber: String,
      licenseNumber: String,
      verificationStatus: {
        type: String,
        enum: ['PENDING', 'VERIFIED', 'REJECTED'],
        default: 'PENDING'
      },
      totalDeliveries: {
        type: Number,
        default: 0
      },
      rating: {
        type: Number,
        default: 5,
        min: 0,
        max: 5
      }
    },

    customerInfo: {
      addressBook: [
        {
          label: String,
          address: String,
          latitude: Number,
          longitude: Number,
          isDefault: Boolean
        }
      ],
      paymentMethods: [
        {
          type: String,
          cardLast4: String,
          expiryDate: String
        }
      ]
    },

    // Timestamps
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    lastLoginAt: Date
  },
  {
    timestamps: true,
    collection: 'users'
  }
);

// Composite unique index: email + userType (same email allowed for different user types)
userSchema.index({ email: 1, userType: 1 }, { unique: true });

// Index for finding active users by type
userSchema.index({ userType: 1, isActive: 1 });

const User = mongoose.model('User', userSchema);

module.exports = {
  User,
  USER_TYPES
};
