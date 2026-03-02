const mongoose = require('mongoose');

const legalConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    loginLegal: {
      preamble: { type: String, default: 'By continuing, you agree to our ' },
      terms: {
        label: { type: String, default: 'Terms of Service' },
        type: { type: String, enum: ['in_app', 'url'], default: 'in_app' },
        url: { type: String, default: null },
      },
      privacy: {
        label: { type: String, default: 'Privacy Policy' },
        type: { type: String, enum: ['in_app', 'url'], default: 'in_app' },
        url: { type: String, default: null },
      },
      connector: { type: String, default: ' and ' },
    },
  },
  { timestamps: true }
);

const LegalConfig = mongoose.models.CustomerLegalConfig || mongoose.model('CustomerLegalConfig', legalConfigSchema, 'customer_legal_config');
module.exports = { LegalConfig };
