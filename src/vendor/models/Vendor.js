const mongoose = require('mongoose');

const PAYMENT_TERMS = ['30 days', '45 days', '60 days'];

// Typed vendor metadata for the procurement/onboarding workflow.
// `strict: false` ensures we don't drop legacy/unknown metadata keys.
const VendorMetadataSchema = new mongoose.Schema(
  {
    registrationNumber: { type: String },
    onboardingSource: {
      type: String,
      enum: ['direct', 'referral', 'field_sales', 'platform', 'existing'],
      default: 'direct',
    },
    serviceableZones: [{ type: String }],
    paymentTerms: {
      type: String,
      enum: ['advance', 'net7', 'net15', 'net30', 'net45', 'cod'],
      default: 'net15',
    },
    creditLimit: { type: Number, default: 0 },
    leadTimeDays: { type: Number, default: 2 },
    minimumOrderValue: { type: Number, default: 0 },
    deliveryWindows: [{ type: String }],
    slaTargetPercent: { type: Number, default: 90 },
    substitutionPolicy: {
      type: String,
      enum: ['allowed', 'not_allowed', 'case_by_case'],
      default: 'case_by_case',
    },
    returnPolicy: {
      type: String,
      enum: ['full', 'partial', 'none'],
      default: 'partial',
    },
    specialInstructions: { type: String },
    categoryLimits: [
      {
        category: String,
        minQty: Number,
        maxQty: Number,
        unit: String,
        leadTimeDays: Number,
      },
    ],
  },
  { _id: false, strict: false }
);

const ContactSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
  },
  { _id: false }
);

const AddressSchema = new mongoose.Schema(
  {
    line1: { type: String, trim: true },
    line2: { type: String, default: null },
    line3: { type: String, default: null },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true, default: 'India' },
    zipCode: { type: String, trim: true },
    pincode: { type: String, trim: true },
  },
  { _id: false }
);

const TaxInfoSchema = new mongoose.Schema(
  {
    gstin: { type: String, trim: true },
  },
  { _id: false }
);

const VendorSchema = new mongoose.Schema(
  {
    vendorCode: { type: String, trim: true },
    vendorName: { type: String, trim: true, maxlength: 100 },
    taxInfo: { type: TaxInfoSchema, default: () => ({}) },
    paymentTerms: { type: String, default: null },
    address: { type: AddressSchema, default: () => ({}) },
    contact: { type: ContactSchema, default: () => ({}) },
    currencyCode: { type: String, uppercase: true, maxlength: 3, default: 'INR' },

    // Legacy + app workflow (kept for backward compatibility)
    name: { type: String, trim: true },
    code: { type: String, trim: true },
    status: { type: String, default: 'pending' },
    stage: {
      type: String,
      enum: [
        'invited', 'new_request', 'kyc_verification',
        'docs_verification', 'review_pending', 'contract',
        'tier_assignment', 'approved', 'rejected',
      ],
      default: 'new_request',
    },
    sla: { type: Number, default: 0 },
    activeRelationships: { type: Number, default: 0 },
    onboarding: { type: mongoose.Schema.Types.Mixed },
    metadata: VendorMetadataSchema,
    archived: { type: Boolean, default: false },
    /** Procurement hub / tenant (default Chennai hub in app code) */
    hubKey: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

VendorSchema.index({ vendorCode: 1 }, { unique: true, sparse: true });
VendorSchema.index({ code: 1 }, { unique: true, sparse: true });
VendorSchema.index({ 'contact.phone': 1 }, { unique: true, sparse: true });
VendorSchema.index({ 'contact.email': 1 }, { unique: true, sparse: true });

const VendorModel = mongoose.models.Vendor || mongoose.model('Vendor', VendorSchema);
VendorModel.PAYMENT_TERMS = PAYMENT_TERMS;
module.exports = VendorModel;
