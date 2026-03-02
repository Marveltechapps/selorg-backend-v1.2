const mongoose = require('mongoose');

const VehicleDocumentsSchema = new mongoose.Schema({
  rcValidTill: {
    type: Date,
    required: true,
  },
  insuranceValidTill: {
    type: Date,
    required: true,
  },
  pucValidTill: {
    type: Date,
    default: null,
  },
}, { _id: false });

const VehicleSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  vehicleId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  type: {
    type: String,
    required: true,
    enum: ['Electric Scooter', 'Motorbike (Gas)', 'Bicycle', 'Car', 'Van'],
  },
  fuelType: {
    type: String,
    required: true,
    enum: ['EV', 'Petrol', 'Diesel', 'Other'],
  },
  assignedRiderId: {
    type: String,
    default: null,
  },
  assignedRiderName: {
    type: String,
    default: null,
    trim: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['active', 'maintenance', 'inactive'],
    default: 'active',
    index: true,
  },
  conditionScore: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 100,
  },
  conditionLabel: {
    type: String,
    required: true,
    enum: ['New', 'Excellent', 'Good', 'Needs Service'],
    default: 'New',
  },
  lastServiceDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  nextServiceDueDate: {
    type: Date,
    required: true,
  },
  currentOdometerKm: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  utilizationPercent: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 0,
  },
  documents: {
    type: VehicleDocumentsSchema,
    required: true,
  },
  pool: {
    type: String,
    required: true,
    enum: ['Hub', 'Dedicated', 'Spare'],
    default: 'Spare',
    index: true,
  },
  notes: {
    type: String,
    default: null,
    trim: true,
  },
  location: {
    type: String,
    default: null,
    trim: true,
  },
}, {
  timestamps: true,
  collection: 'vehicles',
});

// Auto-update conditionLabel based on conditionScore
VehicleSchema.pre('save', function(next) {
  if (this.isModified('conditionScore')) {
    if (this.conditionScore >= 90) {
      this.conditionLabel = 'Excellent';
    } else if (this.conditionScore >= 75) {
      this.conditionLabel = 'Good';
    } else if (this.conditionScore >= 60) {
      this.conditionLabel = 'Good';
    } else {
      this.conditionLabel = 'Needs Service';
    }
  }
  next();
});

// Indexes for common queries
VehicleSchema.index({ status: 1, pool: 1 });
VehicleSchema.index({ type: 1, fuelType: 1 });
VehicleSchema.index({ assignedRiderId: 1 });

const Vehicle = mongoose.models.Vehicle || mongoose.model('Vehicle', VehicleSchema);

module.exports = Vehicle;

