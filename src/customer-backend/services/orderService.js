const mongoose = require('mongoose');
const { Order } = require('../models/Order');
const { CustomerAddress } = require('../models/CustomerAddress');
const { Cart } = require('../models/Cart');
const { Product } = require('../models/Product');
const { findNearestDarkstore, resolveStoreId } = require('./storeLocator');

function formatOrderForApp(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(o._id),
    orderNumber: o.orderNumber,
    items: (o.items || []).map((it) => ({
      id: String(it._id),
      productId: String(it.productId),
      productName: it.productName,
      variantId: it.variantId || '',
      variantSize: it.variantSize || '',
      quantity: it.quantity,
      price: it.price,
      originalPrice: it.originalPrice,
      image: it.image || '',
      itemStatus: it.itemStatus || 'pending',
      substituteProductName: it.substituteProductName || '',
    })),
    status: o.status,
    timeline: (o.timeline || []).map((t) => ({
      status: t.status,
      timestamp: t.timestamp,
      note: t.note || '',
      actor: t.actor || '',
    })),
    cancellationReason: o.cancellationReason || '',
    deliveryAddress: o.deliveryAddress
      ? {
          id: String(o.addressId || ''),
          address: [o.deliveryAddress.line1, o.deliveryAddress.line2].filter(Boolean).join(', '),
          line1: o.deliveryAddress.line1 || '',
          line2: o.deliveryAddress.line2 || '',
          city: o.deliveryAddress.city,
          state: o.deliveryAddress.state || '',
          pincode: o.deliveryAddress.pincode || '',
          landmark: o.deliveryAddress.landmark,
        }
      : {},
    deliveryNotes: o.deliveryNotes || '',
    paymentMethod: o.paymentMethod
      ? {
          id: o.paymentMethodId || '',
          type: o.paymentMethod.methodType || 'cash',
          last4: o.paymentMethod.last4,
        }
      : { id: '', type: 'cash' },
    itemTotal: o.itemTotal,
    adjustedTotal: o.adjustedTotal,
    handlingCharge: o.handlingCharge,
    deliveryFee: o.deliveryFee,
    discount: o.discount,
    walletDeduction: o.walletDeduction || 0,
    totalBill: o.totalBill,
    createdAt: o.createdAt,
    estimatedDelivery: o.estimatedDelivery,
    deliveredAt: o.deliveredAt,
    deliveryOtp: o.deliveryOtp,
    otpVerified: o.otpVerified,
    refundId: o.refundId ? String(o.refundId) : null,
    refundStatus: o.refundStatus || 'none',
    refundAmount: o.refundAmount || 0,
    ratingScore: o.ratingScore,
    ratingComment: o.ratingComment || '',
    paymentStatus: o.paymentStatus || 'pending',
    storeId: o.storeId ? String(o.storeId) : null,
    riderId: o.riderId ? String(o.riderId) : null,
  };
}

async function generateOrderNumber() {
  const count = await Order.countDocuments();
  const prefix = 'ORD';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}-${date}-${String(count + 1).padStart(5, '0')}`;
}

async function listOrders(userId, page = 1, limit = 20, status) {
  const q = { userId: new mongoose.Types.ObjectId(userId) };
  if (status) q.status = status;
  const skip = (Math.max(1, page) - 1) * limit;
  const [orders, total] = await Promise.all([
    Order.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(q),
  ]);
  return {
    data: orders.map((o) => formatOrderForApp({ ...o, _id: o._id })),
    pagination: {
      page: Math.max(1, page),
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

async function getOrderById(userId, orderId) {
  const order = await Order.findOne({ _id: orderId, userId }).lean();
  return order ? formatOrderForApp({ ...order, _id: order._id }) : null;
}

async function createOrder(userId, body) {
  const { items, addressId, paymentMethodId, paymentMethodType, couponCode, deliveryTip } = body || {};
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { error: 'Items required' };
  }
  const address = await CustomerAddress.findOne({ _id: addressId, userId }).lean();
  if (!address) return { error: 'Address not found' };

  let itemTotal = 0;
  const orderItems = [];
  for (const line of items) {
    const product = await Product.findById(line.productId).lean();
    if (!product) return { error: `Product not found: ${line.productId}` };
    let price = product.price;
    let variantSize = '';
    if (product.variants && product.variants.length) {
      const v = product.variants.find((x) => String(x._id) === String(line.variantId)) || product.variants[0];
      price = v.price ?? product.price;
      variantSize = v.size || '';
    }
    const qty = Math.max(1, line.quantity || 1);
    itemTotal += price * qty;
    orderItems.push({
      productId: product._id,
      productName: product.name,
      variantId: line.variantId || '',
      variantSize,
      quantity: qty,
      price,
      originalPrice: product.originalPrice,
      image: (product.images && product.images[0]) || '',
    });
  }

  const deliveryFee = 0;
  const handlingCharge = 0;
  const discount = 0;
  const totalBill = itemTotal + deliveryFee + handlingCharge - discount + (deliveryTip || 0);

  const orderNumber = await generateOrderNumber();
  const estimatedDelivery = new Date(Date.now() + 60 * 60 * 1000 * 24); // +1 day

  const nearestStoreCode = await findNearestDarkstore(address.latitude, address.longitude);
  const matchedStoreObjectId = await resolveStoreId(nearestStoreCode);

  const resolvedMethodType = paymentMethodType || (paymentMethodId ? 'card' : 'cash');
  const paymentStatus = resolvedMethodType === 'cash' ? 'cod_pending' : 'paid';

  const order = await Order.create({
    userId: new mongoose.Types.ObjectId(userId),
    orderNumber,
    items: orderItems,
    status: 'pending',
    timeline: [{ status: 'pending', timestamp: new Date(), note: 'Order placed', actor: 'customer' }],
    addressId: address._id,
    storeId: matchedStoreObjectId || undefined,
    deliveryAddress: {
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      landmark: address.label,
    },
    deliveryNotes: body.deliveryNotes || '',
    paymentMethodId: paymentMethodId || '',
    paymentMethod: {
      methodType: resolvedMethodType,
      last4: '',
    },
    paymentStatus,
    itemTotal,
    handlingCharge,
    deliveryFee,
    discount,
    totalBill,
    estimatedDelivery,
  });

  await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });

  const populated = await Order.findById(order._id).lean();
  const response = formatOrderForApp({ ...populated, _id: populated._id });

  // Send push notification for order placed
  try {
    const { sendOrderStatusNotification } = require('./notificationService');
    await sendOrderStatusNotification(order, 'pending');
  } catch (err) {
    console.warn('Order placed notification failed (non-blocking):', err.message);
  }

  // Post-order integrations (best-effort): create darkstore/warehouse orders, payment attempt, and emit realtime events
  try {
    const websocketService = require('../../utils/websocket');
    const DarkstoreOrder = require('../../darkstore/models/Order');
    const WarehouseOrder = require('../../warehouse/models/Order');
    const CustomerPayment = require('../../finance/models/CustomerPayment');
    const LiveTransaction = require('../../finance/models/LiveTransaction');
    const { CustomerUser } = require('../models/CustomerUser');

      // Resolve customer info
      let customerName = 'Customer';
      let phoneNumber = '';
      try {
        const cu = await CustomerUser.findById(userId).lean();
        if (cu) {
          customerName = cu.name || customerName;
          phoneNumber = cu.phoneNumber || '';
        }
      } catch (err) {
        // ignore
      }

    const storeId = nearestStoreCode
      || process.env.DEFAULT_STORE_ID
      || 'DS-DEFAULT-01';
    const orderId = response.orderNumber || response.id || `ORD-${Date.now()}`;
      const itemCount = (response.items || []).length || 1;
      const slaMinutes = parseInt(process.env.DEFAULT_SLA_MINUTES || '15', 10);
      const slaDeadline = new Date(Date.now() + slaMinutes * 60 * 1000);

      const deliveryAddrParts = [
        response.deliveryAddress?.line1,
        response.deliveryAddress?.line2,
        response.deliveryAddress?.city,
        response.deliveryAddress?.state,
        response.deliveryAddress?.pincode,
      ].filter(Boolean);
      const deliveryAddrStr = deliveryAddrParts.join(', ') || response.deliveryAddress?.address || '';

      const dsItems = (response.items || []).map((it) => ({
        productName: it.productName || '',
        quantity: it.quantity || 1,
        price: it.price || 0,
        image: it.image || '',
        variantSize: it.variantSize || '',
      }));

      try {
        await DarkstoreOrder.create({
          order_id: orderId,
          id: orderId,
          store_id: storeId,
          order_type: response.order_type || 'Normal',
          status: 'new',
          item_count: itemCount,
          items: dsItems,
          sla_timer: `${String(slaMinutes).padStart(2, '0')}:00`,
          sla_status: 'safe',
          sla_deadline: slaDeadline,
          assignee: {},
          customer_name: customerName,
          customer_phone: phoneNumber || '',
          delivery_address: deliveryAddrStr,
          delivery_notes: response.deliveryNotes || '',
          rto_risk: false,
          payment_status: paymentStatus,
          payment_method: resolvedMethodType,
          total_bill: totalBill,
        });
      } catch (err) {
        console.warn('Darkstore order create failed (non-blocking):', err.message);
      }

      try {
        await WarehouseOrder.create({
          id: orderId,
          order_id: orderId,
          status: 'pending',
          riderId: null,
          etaMinutes: null,
          slaDeadline,
          pickupLocation: storeId,
          dropLocation: response.deliveryAddress?.address || response.deliveryAddress?.city || 'Unknown',
          zone: response.deliveryAddress?.city || '',
          customerName,
          items: (response.items || []).map((it) => it.productName || it.productId || String(it.id || '')),
          timeline: [],
        });
      } catch (err) {
        console.warn('Warehouse order create failed (non-blocking):', err.message);
      }

      try {
        const paymentType = response.paymentMethod?.type || 'cash';
        const methodDisplayMap = {
          card: 'Credit/Debit Card',
          upi: 'UPI',
          wallet: 'Wallet',
          cash: 'Cash on Delivery',
        };
        const methodDisplay = methodDisplayMap[paymentType] || paymentType;
        const gatewayRef = paymentType === 'cash' ? `COD-${Date.now()}` : `GW-${Date.now()}`;
        const initialStatus = paymentType === 'cash' ? 'pending' : 'success';

        try {
          await CustomerPayment.create({
            entityId: 'default',
            customerName: customerName,
            customerEmail: `customer-${userId}@selorg.com`,
            orderId,
            amount: response.totalBill || 0,
            currency: 'INR',
            paymentMethodDisplay: methodDisplay,
            methodType: paymentType,
            gatewayRef,
            status: initialStatus,
          });
        } catch (err) {
          console.warn('CustomerPayment create failed (non-blocking):', err.message);
        }

        let liveTxnId = null;
        const txnTimestamp = new Date().toISOString();
        const txnIdStr = `TXN-${Date.now()}`;
        const maskedDetails = paymentType === 'card' ? '****' : paymentType.toUpperCase();
        const gateway = paymentType === 'cash' ? 'cod' : 'internal';

        try {
          const liveTxn = await LiveTransaction.create({
            txnId: txnIdStr,
            entityId: 'default',
            amount: response.totalBill || 0,
            currency: 'INR',
            methodDisplay: methodDisplay,
            maskedDetails,
            status: initialStatus,
            gateway,
            orderId,
            customerName,
          });
          liveTxnId = liveTxn._id.toString();
        } catch (err) {
          console.warn('LiveTransaction create failed (non-blocking):', err.message);
        }

        const paymentEvent = {
          id: liveTxnId || `txn-${Date.now()}`,
          txnId: txnIdStr,
          orderId,
          amount: response.totalBill || 0,
          currency: 'INR',
          methodType: paymentType,
          methodDisplay: methodDisplay,
          status: initialStatus,
          customerName,
          maskedDetails,
          gateway,
          createdAt: txnTimestamp,
        };
        websocketService?.broadcastToRole?.('finance', 'payment:created', paymentEvent);
        websocketService?.broadcastToRole?.('admin', 'payment:created', paymentEvent);
        websocketService?.broadcastToRole?.('darkstore', 'payment:created', paymentEvent);
      } catch (err) {
        console.warn('Payment integration failed (non-blocking):', err.message);
      }

      // Emit order created events (same payload to all relevant rooms)
      try {
        const ph = String(phoneNumber || '');
        const maskedPhone = ph.length >= 8
          ? ph.slice(0, 2) + '******' + ph.slice(-2)
          : ph ? '******' : '';

        const orderEvent = {
          order_id: orderId,
          item_count: itemCount,
          items: dsItems,
          customer_name: customerName,
          customer_phone: maskedPhone,
          delivery_address: deliveryAddrStr,
          store_id: storeId,
          sla_deadline: slaDeadline,
          sla_status: 'safe',
          status: 'new',
          order_type: 'Normal',
          createdAt: new Date(),
          payment_status: paymentStatus,
          payment_method: resolvedMethodType,
          total_bill: totalBill,
        };
        websocketService?.broadcastToRole?.('darkstore', 'order:created', orderEvent);
        websocketService?.broadcastToRole?.('admin', 'order:created', orderEvent);
        websocketService?.broadcastToRole?.('finance', 'order:created', orderEvent);
      } catch (err) {
        console.warn('Websocket broadcast failed (non-blocking):', err.message);
      }
  } catch (err) {
    console.warn('Post-order integrations failed (non-blocking):', err.message);
  }

  return response;
}

const VALID_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['getting-packed', 'cancelled'],
  'getting-packed': ['on-the-way', 'cancelled'],
  'on-the-way': ['arrived', 'cancelled'],
  arrived: ['delivered', 'cancelled'],
};

const STATUS_ACTOR_MAP = {
  confirmed: 'system',
  'getting-packed': 'darkstore',
  'on-the-way': 'rider',
  arrived: 'rider',
  delivered: 'rider',
  cancelled: 'system',
};

const STATUS_NOTE_MAP = {
  confirmed: 'Order confirmed by store',
  'getting-packed': 'Order is being packed',
  'on-the-way': 'Rider picked up, out for delivery',
  arrived: 'Delivery partner has arrived',
  delivered: 'Order delivered',
  cancelled: 'Order cancelled',
};

async function updateCustomerOrderStatus(orderId, newStatus, { actor, note, riderId } = {}) {
  const order = await Order.findById(orderId);
  if (!order) return { error: 'Order not found' };

  const allowed = VALID_TRANSITIONS[order.status];
  if (!allowed || !allowed.includes(newStatus)) {
    return { error: `Cannot transition from "${order.status}" to "${newStatus}"` };
  }

  order.status = newStatus;
  order.timeline.push({
    status: newStatus,
    timestamp: new Date(),
    note: note || STATUS_NOTE_MAP[newStatus] || '',
    actor: actor || STATUS_ACTOR_MAP[newStatus] || 'system',
  });

  if (riderId) order.riderId = riderId;
  if (newStatus === 'delivered') order.deliveredAt = new Date();
  if (newStatus === 'cancelled') {
    order.cancellationReason = note || 'Order cancelled';
  }

  await order.save();

  try {
    const { sendOrderStatusNotification } = require('./notificationService');
    await sendOrderStatusNotification(order, newStatus);
  } catch (e) { /* non-blocking */ }

  try {
    const websocketService = require('../../utils/websocket');
    websocketService?.broadcastToRole?.('customer', 'order:status_updated', {
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      status: newStatus,
      userId: String(order.userId),
    });
  } catch (e) { /* non-blocking */ }

  return formatOrderForApp(order);
}

async function cancelOrder(userId, orderId, reason) {
  const { executeCancellation } = require('./cancellationService');
  const result = await executeCancellation(userId, orderId, reason);
  if (!result) return null;
  if (result.error) return result;
  return formatOrderForApp(result);
}

async function getActiveOrder(userId) {
  const activeStatuses = ['pending', 'confirmed', 'getting-packed', 'on-the-way', 'arrived'];
  let order = await Order.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    status: { $in: activeStatuses },
  })
    .sort({ createdAt: -1 })
    .lean();

  // If no active order, check for recently cancelled/delivered orders (last 5 min)
  // so the customer app can redirect to the appropriate screen
  if (!order) {
    const recentCutoff = new Date(Date.now() - 5 * 60 * 1000);
    order = await Order.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      status: { $in: ['cancelled', 'delivered'] },
      updatedAt: { $gte: recentCutoff },
    })
      .sort({ updatedAt: -1 })
      .lean();
  }

  if (!order) return null;

  const formatted = formatOrderForApp({ ...order, _id: order._id });

  // Attach store coordinates if the order has a storeId
  if (order.storeId) {
    const Store = require('../../merch/models/Store');
    const store = await Store.findById(order.storeId, {
      latitude: 1,
      longitude: 1,
      name: 1,
      address: 1,
      phone: 1,
    }).lean();
    if (store) {
      formatted.storeCoordinates = {
        latitude: store.latitude,
        longitude: store.longitude,
      };
      formatted.storeName = store.name || '';
      formatted.storeAddress = store.address || '';
      formatted.storePhone = store.phone || '';
    }
  }

  // Attach delivery address coordinates from the saved address
  if (order.addressId) {
    const address = await CustomerAddress.findById(order.addressId, {
      latitude: 1,
      longitude: 1,
      label: 1,
    }).lean();
    if (address) {
      formatted.addressCoordinates = {
        latitude: address.latitude,
        longitude: address.longitude,
      };
      formatted.addressLabel = address.label || 'Home';
    }
  }

  // Attach rider details if assigned
  if (order.riderId) {
    try {
      const Rider = require('../../rider/models/Rider');
      const rider = await Rider.findOne(
        { _id: order.riderId },
        { name: 1, avatarInitials: 1, location: 1 }
      ).lean();
      if (rider) {
        formatted.deliveryPartner = {
          name: rider.name || '',
          initials: rider.avatarInitials || '',
        };
      }
    } catch {
      // Rider model lookup optional
    }
  }

  // Compute estimated minutes remaining
  if (order.estimatedDelivery) {
    const remaining = Math.max(
      0,
      Math.round((new Date(order.estimatedDelivery).getTime() - Date.now()) / 60000)
    );
    formatted.deliveryTimeMinutes = remaining;
  } else {
    formatted.deliveryTimeMinutes = null;
  }

  return formatted;
}

module.exports = {
  listOrders,
  getOrderById,
  createOrder,
  cancelOrder,
  getActiveOrder,
  updateCustomerOrderStatus,
};
