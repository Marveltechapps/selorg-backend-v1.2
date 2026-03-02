const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerProduct', required: true },
    variantId: { type: String, default: '' },
    variantSize: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true },
    originalPrice: { type: Number },
    productName: { type: String, default: '' },
    image: { type: String, default: '' },
  },
  { _id: true }
);

const cartSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerUser', required: true, unique: true },
    items: [cartItemSchema],
  },
  { timestamps: true }
);

cartSchema.index({ userId: 1 });

const Cart =
  mongoose.models.CustomerCart ||
  mongoose.model('CustomerCart', cartSchema, 'customer_carts');

module.exports = { Cart };
