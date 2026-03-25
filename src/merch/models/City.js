const mongoose = require('mongoose');
const { Schema } = mongoose;

const CitySchema = new Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    match: /^[A-Z]{3}$/,
  },
  name: { type: String, required: true },
  state: { type: String },
  country: { type: String, default: 'India' },
  isActive: { type: Boolean, default: true },
  metadata: { type: Schema.Types.Mixed },
}, { timestamps: true });

CitySchema.pre('validate', function cityPreValidate(next) {
  if (this.code) {
    this.code = String(this.code).trim().toUpperCase();
  }
  next();
});

CitySchema.index({ code: 1 }, { unique: true });
CitySchema.index({ isActive: 1 });

module.exports = mongoose.models.City || mongoose.model('City', CitySchema);
