const mongoose = require('mongoose');
const { Schema } = mongoose;

const CitySchema = new Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  state: { type: String },
  country: { type: String, default: 'India' },
  isActive: { type: Boolean, default: true },
  metadata: { type: Schema.Types.Mixed },
}, { timestamps: true });

CitySchema.index({ code: 1 }, { unique: true });
CitySchema.index({ isActive: 1 });

module.exports = mongoose.models.City || mongoose.model('City', CitySchema);
