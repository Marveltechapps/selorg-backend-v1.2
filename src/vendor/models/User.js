const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // hashed
    name: String,
    role: { type: String, default: 'admin' },
    assignedStores: [{ type: String }],
    primaryStoreId: { type: String },
    /** Procurement / vendor dashboard tenant (e.g. chennai-hub) */
    hubKey: { type: String, trim: true },
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
