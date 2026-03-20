const mongoose = require('mongoose');

const KitItemSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
  },
  label: {
    type: String,
    required: true,
  },
  iconName: {
    type: String,
    enum: ['tshirt', 'delivery_bag', 'id_card', 'other'],
    default: 'other',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  order: {
    type: Number,
    default: 0,
  }
}, { _id: false });

const RiderKitSchema = new mongoose.Schema({
  title: {
    type: String,
    default: 'Collect Rider Kit',
  },
  description: {
    type: String,
    default: 'Please collect your assets from your assigned hub to start delivering.',
  },
  items: [KitItemSchema],
  isActive: {
    type: Boolean,
    default: true,
  }
}, {
  timestamps: true,
  collection: 'rider_kits',
});

module.exports = mongoose.models.RiderKit || mongoose.model('RiderKit', RiderKitSchema);
