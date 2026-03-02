/**
 * Work Location Model
 * Stores warehouse and darkstore locations for pickers
 */
const mongoose = require('mongoose');

const workLocationSchema = new mongoose.Schema({
  locationId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  name: { 
    type: String, 
    required: true 
  },
  type: { 
    type: String, 
    required: true,
    enum: ['warehouse', 'darkstore'],
    index: true
  },
  address: { 
    type: String, 
    required: true 
  },
  city: String,
  state: String,
  zipCode: String,
  coordinates: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true }
  },
  geofence: {
    radius: { 
      type: Number, 
      default: 500 // meters
    },
    shape: { 
      type: String, 
      default: 'circle',
      enum: ['circle', 'polygon']
    }
  },
  capacity: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium'
  },
  description: String,
  operatingHours: {
    type: String,
    default: '24/7'
  },
  isActive: { 
    type: Boolean, 
    default: true,
    index: true
  },
  features: [String], // ['parking', 'break_room', 'lockers', 'cafeteria']
  maxCapacity: Number, // Maximum number of pickers
  currentOccupancy: { 
    type: Number, 
    default: 0 
  }
}, { 
  timestamps: true,
  collection: 'work_locations'
});

// Compound index for active locations by type
workLocationSchema.index({ isActive: 1, type: 1 });

// Geospatial index for location-based queries
workLocationSchema.index({ 'coordinates.latitude': 1, 'coordinates.longitude': 1 });

module.exports = mongoose.model('WorkLocation', workLocationSchema);
