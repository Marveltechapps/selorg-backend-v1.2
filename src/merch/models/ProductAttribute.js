const mongoose = require('mongoose');
const { Schema } = mongoose;

const ProductAttributeSchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
  description: { type: String, trim: true },
  dataType: { 
    type: String, 
    enum: ['string', 'number', 'boolean', 'select', 'multiselect', 'date', 'decimal'],
    required: true 
  },
  values: [{
    label: { type: String, required: true },
    value: Schema.Types.Mixed,
    displayOrder: { type: Number, default: 0 }
  }],
  isFacet: { type: Boolean, default: false }, // Searchable filter
  isSearchable: { type: Boolean, default: false },
  isFilterable: { type: Boolean, default: false },
  isSortable: { type: Boolean, default: false },
  isVariant: { type: Boolean, default: false }, // For product variants
  isRequired: { type: Boolean, default: false },
  displayOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true, index: true },
  validationRules: {
    minLength: { type: Number },
    maxLength: { type: Number },
    minValue: { type: Number },
    maxValue: { type: Number },
    regex: { type: String },
    allowedValues: [Schema.Types.Mixed]
  },
  metadata: {
    usageCount: { type: Number, default: 0 },
    lastModifiedBy: { type: String, trim: true },
    categorySpecific: [{ type: String }] // Categories where this attribute applies
  }
}, {
  timestamps: true,
  collection: 'product_attributes'
});

// Indexes
ProductAttributeSchema.index({ name: 1 });
ProductAttributeSchema.index({ slug: 1 });
ProductAttributeSchema.index({ isActive: 1, isFacet: 1 });
ProductAttributeSchema.index({ dataType: 1 });

// Methods
ProductAttributeSchema.methods.validateValue = function(value) {
  const rules = this.validationRules;
  
  // Type-specific validation
  switch (this.dataType) {
    case 'string':
      if (typeof value !== 'string') return false;
      if (rules.minLength && value.length < rules.minLength) return false;
      if (rules.maxLength && value.length > rules.maxLength) return false;
      if (rules.regex && !new RegExp(rules.regex).test(value)) return false;
      break;
      
    case 'number':
    case 'decimal':
      if (typeof value !== 'number') return false;
      if (rules.minValue !== undefined && value < rules.minValue) return false;
      if (rules.maxValue !== undefined && value > rules.maxValue) return false;
      break;
      
    case 'boolean':
      if (typeof value !== 'boolean') return false;
      break;
      
    case 'select':
      if (!this.values.some(v => v.value === value)) return false;
      break;
      
    case 'multiselect':
      if (!Array.isArray(value)) return false;
      if (!value.every(v => this.values.some(attr => attr.value === v))) return false;
      break;
      
    case 'date':
      if (!(value instanceof Date) && isNaN(Date.parse(value))) return false;
      break;
  }
  
  // Check allowed values
  if (rules.allowedValues && rules.allowedValues.length > 0) {
    if (!rules.allowedValues.includes(value)) return false;
  }
  
  return true;
};

ProductAttributeSchema.methods.getActiveValues = function() {
  return this.values.sort((a, b) => a.displayOrder - b.displayOrder);
};

module.exports = mongoose.models.ProductAttribute || mongoose.model('ProductAttribute', ProductAttributeSchema);
