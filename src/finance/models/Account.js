const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  type: { 
    type: String, 
    required: true, 
    enum: ['asset', 'liability', 'equity', 'revenue', 'expense'],
    index: true 
  },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
});

module.exports = mongoose.models.Account || mongoose.model('Account', accountSchema);

