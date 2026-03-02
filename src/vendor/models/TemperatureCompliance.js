const mongoose = require('mongoose');

const TemperatureReadingSchema = new mongoose.Schema({
  timestamp: { type: Date, required: true },
  temperature: { type: Number, required: true },
  location: String,
});

const TemperatureComplianceSchema = new mongoose.Schema(
  {
    vendorId: { type: String, required: true, index: true },
    shipmentId: { type: String, required: true, index: true },
    productId: String,
    productName: { type: String, required: true },
    requirement: { type: String, required: true }, // e.g., "2-8°C", "-18°C"
    minTemp: Number,
    maxTemp: Number,
    avgTemp: Number,
    readings: [TemperatureReadingSchema],
    compliant: { type: Boolean, default: true, index: true },
    violations: [{
      timestamp: Date,
      temperature: Number,
      severity: { type: String, enum: ['minor', 'major', 'critical'] },
    }],
    startTime: Date,
    endTime: Date,
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

TemperatureComplianceSchema.index({ vendorId: 1, compliant: 1 });
TemperatureComplianceSchema.index({ shipmentId: 1 });

module.exports = mongoose.models.TemperatureCompliance || mongoose.model('TemperatureCompliance', TemperatureComplianceSchema);
