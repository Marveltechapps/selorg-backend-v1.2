const mongoose = require('mongoose');
const productSchema = new mongoose.Schema(
  {
    // Core identity
    name: { type: String, required: true },
    sku: { type: String, default: '' },
    classification: { type: String, enum: ['Style', 'Variant'], default: 'Style', index: true },
    tag: { type: String, default: '' },
    hierarchyCode: { type: String, default: '', index: true },
    description: {
      type: new mongoose.Schema(
        {
          about: { type: String, default: '' },
          nutrition: { type: String, default: '' },
          originOfPlace: { type: String, default: '' },
          healthBenefits: { type: String, default: '' },
          raw: { type: String, default: '' }, // Backward-compatible string description
        },
        { _id: false }
      ),
      default: () => ({ about: '', nutrition: '', originOfPlace: '', healthBenefits: '', raw: '' }),
    },

    // Media
    images: [{ type: String }],
    imageUrl: { type: String, default: '' },
    /** Optional tile-sized URL for carousels/lists (customer app prefers over imageUrl). */
    thumbnailUrl: { type: String, default: '' },
    cardImageUrl: { type: String, default: '' },
    additionalImages: [{ type: String }],

    // Pricing & tax
    price: { type: Number, required: true },
    mrp: { type: Number, default: 0 },
    baseCost: { type: Number, default: 0 },
    originalPrice: { type: Number },
    costPrice: { type: Number, default: 0 },
    hsnCode: { type: String, default: '' },
    taxPercent: { type: Number, default: 0 },
    gstRate: { type: Number, default: 0 },
    discount: { type: String },
    quantity: { type: String }, // Backward-compatible alias for size
    size: { type: String, default: '' },
    uom: { type: String, default: 'EACH' },

    // Inventory & source
    stockQuantity: { type: Number, default: 0 },
    stock: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 10 },
    brand: { type: String, default: '' },
    brandCode: { type: String, default: '' },
    vendorCode: { type: String, default: '' },
    mfgSkuCode: { type: String, default: '' },
    countryOfOrigin: { type: String, default: 'India' },

    // Taxonomy
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerCategory' },
    subcategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerCategory', default: null },

    // Availability
    status: { type: String, enum: ['active', 'inactive', 'draft'], default: 'active' },
    featured: { type: Boolean, default: false },
    isPurchasable: { type: Boolean, default: true },
    isSaleable: { type: Boolean, default: true },
    isStocked: { type: Boolean, default: true },
    variants: [{ sku: String, size: String, price: Number, originalPrice: Number }],

    // Operational flags
    qcRequired: { type: Boolean, default: false },
    backOrderAllowed: { type: Boolean, default: false },
    backOrderQty: { type: Number, default: 0 },
    serialTracking: { type: Boolean, default: false },
    stackable: { type: Boolean, default: false },
    hazardous: { type: Boolean, default: false },
    poisonous: { type: Boolean, default: false },
    skuRotation: { type: String, default: '' },
    rotateBy: { type: String, default: '' },
    thresholdAlertRequired: { type: Boolean, default: false },
    thresholdQty: { type: Number, default: 0 },

    // Shelf life
    shelfLife: {
      type: new mongoose.Schema(
        {
          value: { type: Number, default: 0 },
          type: { type: String, default: '' },
          total: { type: Number, default: 0 },
          onReceiving: { type: Number, default: 0 },
          onPicking: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: () => ({ value: 0, type: '', total: 0, onReceiving: 0, onPicking: 0 }),
    },

    // SEO
    meta: {
      type: new mongoose.Schema(
        {
          title: { type: String, default: '' },
          keywords: { type: String, default: '' },
          description: { type: String, default: '' },
        },
        { _id: false }
      ),
      default: () => ({ title: '', keywords: '', description: '' }),
    },

    // Admin enrichment
    relatedProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CustomerProduct' }],
    highlights: [{ type: String }],
    deliveryInfo: { type: String, default: '' },
    storeLinks: { type: String, default: '' },
    sortOrder: { type: Number, default: 0 },

    // User-defined fields
    udf: {
      type: new mongoose.Schema(
        {
          udf1: { type: String, default: '' },
          udf2: { type: String, default: '' },
          udf3: { type: String, default: '' },
          udf4: { type: String, default: '' },
          udf5: { type: String, default: '' },
          udf6: { type: String, default: '' },
          udf7: { type: String, default: '' },
          udf8: { type: String, default: '' },
          udf9: { type: String, default: '' },
          udf10: { type: String, default: '' },
        },
        { _id: false }
      ),
      default: () => ({
        udf1: '',
        udf2: '',
        udf3: '',
        udf4: '',
        udf5: '',
        udf6: '',
        udf7: '',
        udf8: '',
        udf9: '',
        udf10: '',
      }),
    },

    attributes: {
      weight: String,
      dimensions: String,
      color: String,
      size: String,
      material: String,
      expiryDays: Number,
    },
    associatedClientName: { type: String, default: '' },
    styleAttributes: { type: String, default: '' },
    style: { type: String, default: '' },
    skuSource: { type: String, default: '' },
    colour: { type: String, default: '' },
    material: { type: String, default: '' },
    upcEan: { type: String, default: '' },
    taxCategory: { type: String, default: '' },
    dimensions: {
      type: new mongoose.Schema(
        {
          heightCm: { type: Number, default: 0 },
          lengthCm: { type: Number, default: 0 },
          widthCm: { type: Number, default: 0 },
          cube: { type: Number, default: 0 },
          weightKg: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: () => ({ heightCm: 0, lengthCm: 0, widthCm: 0, cube: 0, weightKg: 0 }),
    },
    washAndCare: { type: String, default: '' },
    shippingAndReturns: { type: String, default: '' },
    lottableValidation: { type: String, default: '' },
    recvValidationCode: { type: String, default: '' },
    pickingInstructions: { type: String, default: '' },
    shippingInstructions: { type: String, default: '' },
    shippingCharges: { type: Number, default: 0 },
    handlingCharges: { type: Number, default: 0 },
    isArsApplicable: { type: Boolean, default: false },
    followStyle: { type: String, default: '' },
    arsCalculationMethod: { type: String, default: '' },
    fixedStock: { type: Number, default: 0 },
    modelStock: { type: Number, default: 0 },
    imageDescriptions: [{ type: String }],
    isUniqueBarcode: { type: Boolean, default: false },
    taxBreakup: {
      type: new mongoose.Schema(
        {
          sgstPercent: { type: Number, default: 0 },
          cgstPercent: { type: Number, default: 0 },
          igstPercent: { type: Number, default: 0 },
          cessPercent: { type: Number, default: 0 },
          sgstAmount: { type: Number, default: 0 },
          cgstAmount: { type: Number, default: 0 },
          igstAmount: { type: Number, default: 0 },
          cessAmount: { type: Number, default: 0 },
          priceInclGst: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: () => ({
        sgstPercent: 0,
        cgstPercent: 0,
        igstPercent: 0,
        cessPercent: 0,
        sgstAmount: 0,
        cgstAmount: 0,
        igstAmount: 0,
        cessAmount: 0,
        priceInclGst: 0,
      }),
    },
    // Raw import payload from mastersheet row (for full-fidelity storage/audit).
    importRaw: { type: mongoose.Schema.Types.Mixed, default: null },
    tags: [{ type: String }],
    isActive: { type: Boolean, default: true },
    order: { type: Number },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
productSchema.index({ isActive: 1, order: 1 });
productSchema.index({ categoryId: 1 });
productSchema.index({ subcategoryId: 1 });
productSchema.index({ sku: 1 });
productSchema.index({ status: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ hierarchyCode: 1, classification: 1, isActive: 1, isSaleable: 1 });
productSchema.index(
  { name: 'text', 'description.about': 'text', 'description.nutrition': 'text', tag: 'text' },
  { weights: { name: 10, tag: 5, 'description.about': 2, 'description.nutrition': 1 } }
);
const Product = mongoose.models.CustomerProduct || mongoose.model('CustomerProduct', productSchema, 'customer_products');
module.exports = { Product };
