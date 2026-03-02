const mongoose = require('mongoose');

const powerBackupSchema = new mongoose.Schema(
  {
    battery_level: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    runtime: {
      type: String,
      required: true,
    },
    store_id: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

powerBackupSchema.index({ store_id: 1 });

module.exports = mongoose.models.PowerBackup || mongoose.model('PowerBackup', powerBackupSchema);

