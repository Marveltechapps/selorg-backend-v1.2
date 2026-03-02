const { getOrderById } = require('../services/orderService');

const PAYMENT_LABELS = {
  cash: 'Cash on Delivery',
  cod: 'Cash on Delivery',
  upi: 'UPI',
  card: 'Credit/Debit Card',
  netbanking: 'Net Banking',
  wallet: 'Wallet',
};

function resolvePaymentLabel(paymentMethod, paymentMethodFallback) {
  if (typeof paymentMethod === 'string') {
    return PAYMENT_LABELS[paymentMethod.toLowerCase()] || paymentMethod;
  }
  if (paymentMethod && typeof paymentMethod === 'object') {
    const key = paymentMethod.type || paymentMethod.methodType || '';
    const label = PAYMENT_LABELS[key.toLowerCase()] || key || 'N/A';
    if (paymentMethod.last4) return `${label} (****${paymentMethod.last4})`;
    return label;
  }
  if (typeof paymentMethodFallback === 'string') {
    return PAYMENT_LABELS[paymentMethodFallback.toLowerCase()] || paymentMethodFallback;
  }
  return 'N/A';
}

async function invoice(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const orderId = req.params.id;
    const order = await getOrderById(userId, orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const addr = order.deliveryAddress;
    const addressStr = typeof addr === 'string'
      ? addr
      : [addr?.line1, addr?.line2, addr?.address, addr?.city, addr?.state, addr?.pincode].filter(Boolean).join(', ') || 'N/A';

    const items = (order.items || []).map((item) => ({
      name: item.productName || item.name || 'Item',
      quantity: item.quantity || 1,
      unitPrice: item.price || 0,
      originalPrice: item.originalPrice || item.price || 0,
      total: (item.price || 0) * (item.quantity || 1),
      variantSize: item.variantSize || null,
    }));

    const invoiceData = {
      invoiceNumber: `INV-${(order.orderNumber || order.order_id || orderId).toString().toUpperCase()}`,
      orderNumber: order.orderNumber || order.order_id || orderId,
      orderDate: order.createdAt || new Date().toISOString(),
      deliveryAddress: addressStr,
      paymentMethod: resolvePaymentLabel(order.paymentMethod, order.payment_method),
      items,
      subtotal: order.itemTotal || items.reduce((sum, i) => sum + i.total, 0),
      handlingCharge: order.handlingCharge || 0,
      deliveryFee: order.deliveryFee || 0,
      discount: order.discount || 0,
      totalAmount: order.totalBill || order.total || order.totalAmount || 0,
      taxInfo: {
        gstNumber: 'GSTIN: 27AABCU9603R1ZM',
        note: 'Prices are inclusive of all applicable taxes',
      },
    };

    res.status(200).json({ success: true, data: invoiceData });
  } catch (err) {
    console.error('invoice generation error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate invoice' });
  }
}

module.exports = { invoice };
