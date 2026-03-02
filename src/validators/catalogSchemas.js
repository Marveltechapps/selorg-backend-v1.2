const { z } = require('zod');

const createProductSchema = z.object({
  body: z.object({
    sku: z.string().min(1, 'SKU is required'),
    name: z.string().min(1, 'Product name is required'),
    description: z.string().min(1, 'Description is required'),
    category: z.string().min(1, 'Category is required'),
    subcategory: z.string().optional(),
    brand: z.string().min(1, 'Brand is required'),
    price: z.number().min(0, 'Price must be non-negative'),
    costPrice: z.number().min(0, 'Cost price must be non-negative'),
    stockQuantity: z.number().min(0).optional(),
    lowStockThreshold: z.number().min(0).optional(),
    imageUrl: z.string().url().optional(),
    images: z.array(z.string()).optional(),
    status: z.enum(['active', 'inactive', 'draft']).optional(),
    featured: z.boolean().optional(),
    attributes: z.object({}).passthrough().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

const updateProductSchema = z.object({
  params: z.object({
    productId: z.string().min(1, 'Product ID is required'),
  }),
  body: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    price: z.number().min(0).optional(),
    costPrice: z.number().min(0).optional(),
    stockQuantity: z.number().min(0).optional(),
    status: z.enum(['active', 'inactive', 'draft']).optional(),
    featured: z.boolean().optional(),
    images: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }),
});

const getProductsSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    category: z.string().optional(),
    status: z.string().optional(),
    stockFilter: z.string().optional(),
  }),
});

module.exports = {
  createProductSchema,
  updateProductSchema,
  getProductsSchema,
};

