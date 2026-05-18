const mongoose = require('mongoose');
const { Schema } = mongoose;

const ProductTaxonomySchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
  parent: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'ProductTaxonomy',
    default: null
  },
  level: { type: Number, default: 0 }, // 0 for root, 1 for first child, etc.
  description: { type: String, trim: true },
  icon: { type: String }, // Emoji or URL
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true, index: true },
  image: {
    url: { type: String },
    alt: { type: String }
  },
  seo: {
    metaTitle: { type: String },
    metaDescription: { type: String },
    keywords: [{ type: String }]
  },
  metadata: {
    productCount: { type: Number, default: 0 },
    avgPrice: { type: Number, default: 0 },
    minPrice: { type: Number },
    maxPrice: { type: Number },
    lastSyncedAt: { type: Date }
  },
  displaySettings: {
    layout: { type: String, enum: ['grid', 'list', 'carousel'], default: 'grid' },
    itemsPerPage: { type: Number, default: 24 },
    displayBadge: { type: Boolean, default: false },
    badgeText: { type: String }
  }
}, {
  timestamps: true,
  collection: 'product_taxonomies'
});

// Indexes
ProductTaxonomySchema.index({ slug: 1 });
ProductTaxonomySchema.index({ parent: 1, sortOrder: 1 });
ProductTaxonomySchema.index({ level: 1 });
ProductTaxonomySchema.index({ isActive: 1 });
ProductTaxonomySchema.index({ createdAt: -1 });

// Methods for hierarchy traversal
ProductTaxonomySchema.methods.getAncestors = async function() {
  const ancestors = [];
  let current = this;
  
  while (current.parent) {
    current = await current.constructor.findById(current.parent);
    if (current) {
      ancestors.unshift(current);
    } else {
      break;
    }
  }
  
  return ancestors;
};

ProductTaxonomySchema.methods.getDescendants = async function() {
  const descendants = [];
  const queue = [this._id];
  
  while (queue.length > 0) {
    const parentId = queue.shift();
    const children = await this.constructor.find({ parent: parentId });
    
    children.forEach(child => {
      descendants.push(child);
      queue.push(child._id);
    });
  }
  
  return descendants;
};

ProductTaxonomySchema.methods.getPath = async function() {
  const ancestors = await this.getAncestors();
  const path = ancestors.map(a => a.name);
  path.push(this.name);
  return path.join(' > ');
};

ProductTaxonomySchema.methods.getBreadcrumb = async function() {
  const ancestors = await this.getAncestors();
  const breadcrumb = ancestors.map(a => ({
    id: a._id,
    name: a.name,
    slug: a.slug
  }));
  breadcrumb.push({
    id: this._id,
    name: this.name,
    slug: this.slug
  });
  return breadcrumb;
};

ProductTaxonomySchema.methods.getDirectChildren = async function() {
  return this.constructor.find({ parent: this._id }).sort({ sortOrder: 1 });
};

// Recursively get all children with hierarchy
ProductTaxonomySchema.methods.getChildrenHierarchy = async function() {
  const children = await this.getDirectChildren();
  
  for (let child of children) {
    child.children = await child.getChildrenHierarchy();
  }
  
  return children;
};

// Statics
ProductTaxonomySchema.statics.getRootTaxonomies = function() {
  return this.find({ parent: null, isActive: true })
    .sort({ sortOrder: 1 });
};

ProductTaxonomySchema.statics.getFullHierarchy = async function() {
  const roots = await this.getRootTaxonomies();
  
  for (let root of roots) {
    root.children = await root.getChildrenHierarchy();
  }
  
  return roots;
};

ProductTaxonomySchema.pre('save', async function(next) {
  if (this.parent) {
    const parent = await this.constructor.findById(this.parent);
    if (parent) {
      this.level = parent.level + 1;
    }
  } else {
    this.level = 0;
  }
  next();
});

module.exports = mongoose.models.ProductTaxonomy || mongoose.model('ProductTaxonomy', ProductTaxonomySchema);
