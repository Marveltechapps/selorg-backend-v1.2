const mongoose = require('mongoose');
const { Order } = require('../models/Order');
const { WorldlinePayment } = require('../models/WorldlinePayment');
const { CustomerAddress } = require('../models/CustomerAddress');
const { Cart } = require('../models/Cart');
const { Product } = require('../models/Product');
const { PricingCoupon } = require('../../merch/models/PricingCoupon');
const { CouponRedemption } = require('../models/CouponRedemption');
const { calculatePricing, compareWithLegacy } = require('./pricingEngineService');
const { clearCart: clearUserCart } = require('./cartService');
const { resolveStoreId } = require('./storeLocator');
const { geocodeAddress } = require('./geocodingService');
const { assertStockAllowsAsync } = require('../utils/productStock');
const {
  buildPaymentMethodPresentation,
  buildEstimatedDeliveryMessage,
} = require('../utils/paymentMethodDisplay');

/** All orders route to Adyar darkstore only */
const ADYAR_STORE_ID = 'DS-Adyar-01';
const ADYAR_FALLBACK_COORDINATES = { latitude: 13.0067, longitude: 80.2573 };
const usePricingEngineForOrders = true;

function toValidCoordinate(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

function coordinatesFromGeoJsonLocation(location) {
  const coords = location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return toValidCoordinate(coords[1], coords[0]);
}

function buildDeliveryAddressString(address) {
  if (!address || typeof address !== 'object') return '';
  return [address.line1, address.line2, address.landmark, address.city, address.state, address.pincode]
    .filter(Boolean)
    .map(String)
    .join(', ')
    .trim();
}

async function resolveStoreTrackingDetails(order) {
  const Store = require('../../merch/models/Store');
  const { DarkStore } = require('../models/DarkStore');

  const attachFromStoreDoc = (store) => {
    const coordinates =
      toValidCoordinate(store?.latitude, store?.longitude) ||
      coordinatesFromGeoJsonLocation(store?.location);
    if (!coordinates) return null;
    return {
      coordinates,
      name: store.name || 'Store',
      address: store.address || '',
      phone: store.phone || '',
    };
  };

  if (order.storeId) {
    const store = await Store.findById(order.storeId, {
      latitude: 1,
      longitude: 1,
      name: 1,
      address: 1,
      phone: 1,
      location: 1,
    }).lean();
    const resolved = attachFromStoreDoc(store);
    if (resolved) return resolved;
  }

  const storeByCode = await Store.findOne(
    { code: ADYAR_STORE_ID },
    { latitude: 1, longitude: 1, name: 1, address: 1, phone: 1, location: 1 }
  ).lean();
  const resolvedByCode = attachFromStoreDoc(storeByCode);
  if (resolvedByCode) return resolvedByCode;

  const darkStore = await DarkStore.findOne(
    { code: ADYAR_STORE_ID, isActive: true },
    { name: 1, address: 1, contactPhone: 1, location: 1 }
  ).lean();
  const darkCoords = coordinatesFromGeoJsonLocation(darkStore?.location);
  if (darkCoords) {
    const addr = darkStore?.address || {};
    return {
      coordinates: darkCoords,
      name: darkStore.name || 'Adyar',
      address: [addr.line1, addr.line2, addr.city, addr.state, addr.pincode].filter(Boolean).join(', '),
      phone: darkStore.contactPhone || '',
    };
  }

  return {
    coordinates: ADYAR_FALLBACK_COORDINATES,
    name: 'Adyar',
    address: '',
    phone: '',
  };
}

async function resolveAddressTrackingDetails(order) {
  const snapshotCoords = toValidCoordinate(
    order.deliveryAddress?.latitude,
    order.deliveryAddress?.longitude
  );
  if (snapshotCoords) {
    return {
      coordinates: snapshotCoords,
      label: order.deliveryAddress?.landmark || 'Home',
    };
  }

  if (order.addressId) {
    const address = await CustomerAddress.findById(order.addressId, {
      latitude: 1,
      longitude: 1,
      label: 1,
      line1: 1,
      line2: 1,
      landmark: 1,
      city: 1,
      state: 1,
      pincode: 1,
    }).lean();
    if (address) {
      const savedCoords = toValidCoordinate(address.latitude, address.longitude);
      if (savedCoords) {
        return { coordinates: savedCoords, label: address.label || 'Home' };
      }
      const geo = await geocodeAddress(buildDeliveryAddressString(address));
      if (geo) {
        return {
          coordinates: { latitude: geo.latitude, longitude: geo.longitude },
          label: address.label || 'Home',
        };
      }
    }
  }

  const deliveryAddressStr = buildDeliveryAddressString(order.deliveryAddress);
  if (deliveryAddressStr) {
    const geo = await geocodeAddress(deliveryAddressStr);
    if (geo) {
      return {
        coordinates: { latitude: geo.latitude, longitude: geo.longitude },
        label: order.deliveryAddress?.landmark || 'Home',
      };
    }
  }

  return null;
}

function formatOrderForApp(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  const paymentPresentation = buildPaymentMethodPresentation(o, o._worldlinePayment || null);
  const paymentMethodPayload = o.paymentMethod
    ? {
        id: o.paymentMethodId || '',
        type: o.paymentMethod.methodType || 'cash',
        last4: o.paymentMethod.last4,
        instrument: o.paymentMethod.instrument || paymentPresentation.instrument || '',
        displayLabel: o.paymentMethod.displayLabel || paymentPresentation.display || '',
        paymentMode: o.paymentMethod.paymentMode || '',
        display: paymentPresentation.display,
        detailDisplay: paymentPresentation.detailDisplay || paymentPresentation.display,
        lines: paymentPresentation.lines,
      }
    : {
        id: '',
        type: 'cash',
        display: 'Cash on Delivery',
        detailDisplay: 'Cash on Delivery',
        lines: [{ label: 'Cash on Delivery', amount: null }],
      };

  return {
    id: String(o._id),
    orderNumber: o.orderNumber,
    items: (o.items || []).map((it, index) => ({
      id: String(it._id || `${it.productId || 'item'}-${index}`),
      productId: String(it.productId || ''),
      productName: it.productName || 'Item',
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
    paymentMethod: paymentMethodPayload,
    paymentMethodDisplay: paymentPresentation.detailDisplay || paymentPresentation.display,
    estimatedDeliveryMessage: buildEstimatedDeliveryMessage(o),
    itemTotal: o.itemTotal,
    adjustedTotal: o.adjustedTotal,
    totalTax: o.totalTax || 0,
    handlingCharge: o.handlingCharge,
    deliveryFee: o.deliveryFee,
    deliveryTip: o.deliveryTip || 0,
    discount: o.discount,
    couponCode: o.checkoutCouponCode || '',
    pricingSnapshot: o.pricingSnapshot || null,
    walletDeduction: o.walletDeduction || 0,
    onlineAmountDue: (() => {
      const walletPart = Number(o.walletDeduction) || 0;
      const total = Number(o.totalBill) || 0;
      const methodType = o.paymentMethod?.methodType;
      if (walletPart > 0) {
        if (o.onlineAmountDue != null && Number(o.onlineAmountDue) >= 0) {
          return Number(o.onlineAmountDue);
        }
        return Math.max(0, roundOrderMoney(total - walletPart));
      }
      if (isGatewayPrepayment(methodType)) return total;
      return 0;
    })(),
    requiresOnlinePayment: (() => {
      const methodType = o.paymentMethod?.methodType;
      if (!isGatewayPrepayment(methodType)) return false;
      if (o.paymentStatus === 'paid' || o.status === 'cancelled') return false;
      const walletPart = Number(o.walletDeduction) || 0;
      const total = Number(o.totalBill) || 0;
      const due =
        walletPart > 0
          ? o.onlineAmountDue != null && Number(o.onlineAmountDue) >= 0
            ? Number(o.onlineAmountDue)
            : Math.max(0, roundOrderMoney(total - walletPart))
          : total;
      return due > 0 && o.paymentStatus === 'pending';
    })(),
    totalBill: o.totalBill,
    createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : null,
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
  const [ordersSnapshot, total] = await Promise.all([
    Order.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(q),
  ]);
  await reconcileWorldlinePaymentsForOrderList(userId, ordersSnapshot);
  const orders = await Order.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
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
  let order = await Order.findOne({ _id: orderId, userId }).lean();
  if (!order) return null;
  await reconcileOrderWithLatestWorldlinePayment(userId, order);
  order = await Order.findOne({ _id: orderId, userId }).lean();
  if (!order) return null;

  const worldlinePayment = await WorldlinePayment.findOne({
    orderId: order._id,
    purpose: { $ne: 'wallet_topup' },
  })
    .sort({ createdAt: -1 })
    .lean();

  return formatOrderForApp({
    ...order,
    _id: order._id,
    _worldlinePayment: worldlinePayment || null,
  });
}

function isGatewayPrepayment(resolvedMethodType) {
  return resolvedMethodType === 'card' || resolvedMethodType === 'upi' || resolvedMethodType === 'digital';
}

function isWalletCheckoutRequest(methodType) {
  const key = String(methodType || '').trim().toLowerCase();
  return key === 'wallet' || key === 'selorg_wallet';
}

function roundOrderMoney(amount) {
  return Math.round((Number(amount) || 0) * 100) / 100;
}

/**
 * Restore wallet funds taken for a partial-wallet order when online payment is voided.
 * Idempotent via Order.walletRefundedAt + wallet ledger unique reference.
 */
async function refundWalletDeductionOnVoid(orderDoc) {
  const deduction = roundOrderMoney(orderDoc?.walletDeduction);
  if (!(deduction > 0)) return { skipped: true, reason: 'no_deduction' };
  if (orderDoc.walletRefundedAt) return { skipped: true, reason: 'already_refunded' };

  const claimed = await Order.findOneAndUpdate(
    {
      _id: orderDoc._id,
      walletDeduction: { $gt: 0 },
      walletRefundedAt: null,
    },
    { $set: { walletRefundedAt: new Date() } },
    { new: true }
  );
  if (!claimed) return { skipped: true, reason: 'claim_failed' };

  try {
    const { refundWalletForFailedOrderPayment } = require('./walletService');
    const result = await refundWalletForFailedOrderPayment(
      claimed.userId,
      deduction,
      claimed._id,
      { description: `Wallet restored for cancelled order ${claimed.orderNumber || claimed._id}` }
    );
    if (result?.error) {
      // Allow a later retry to re-attempt the credit.
      await Order.updateOne({ _id: claimed._id }, { $set: { walletRefundedAt: null } });
      console.warn('[order-service] wallet void refund failed', {
        orderId: String(claimed._id),
        error: result.error,
      });
      return { error: result.error };
    }
    return { ok: true, credited: result?.credited ?? deduction, alreadyCredited: !!result?.alreadyCredited };
  } catch (err) {
    await Order.updateOne({ _id: claimed._id }, { $set: { walletRefundedAt: null } });
    console.warn('[order-service] wallet void refund exception', {
      orderId: String(claimed._id),
      error: err?.message,
    });
    return { error: err?.message || 'wallet refund failed' };
  }
}

/** Darkstore, warehouse, finance stubs, WebSocket — same as legacy post-createOrder block. */
async function runPostOrderIntegrations(userId, response, paymentStatus, resolvedMethodType, totalBill) {
  try {
    const websocketService = require('../../utils/websocket');
    const DarkstoreOrder = require('../../darkstore/models/Order');
    const WarehouseOrder = require('../../warehouse/models/Order');
    const CustomerPayment = require('../../finance/models/CustomerPayment');
    const LiveTransaction = require('../../finance/models/LiveTransaction');
    const { CustomerUser } = require('../models/CustomerUser');

    let customerName = 'Customer';
    let phoneNumber = '';
    let customerEmail = '';
    try {
      const cu = await CustomerUser.findById(userId).lean();
      if (cu) {
        customerName = cu.name || customerName;
        phoneNumber = cu.phoneNumber || '';
        customerEmail = cu.email || '';
      }
    } catch (err) {
      // ignore
    }

    const storeId = ADYAR_STORE_ID;
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

    const dsPaymentMethod = (() => {
      const m = String(resolvedMethodType || '').toLowerCase();
      if (m === 'upi') return 'upi';
      if (m === 'wallet') return 'wallet';
      if (m === 'cash' || m === 'cod') return 'cash';
      // Worldline / digital / card all map to darkstore enum `card`
      return 'card';
    })();

    const dsItems = (response.items || []).map((it) => ({
      productId: it.productId ? String(it.productId) : '',
      productName: it.productName || '',
      quantity: it.quantity || 1,
      price: it.price || 0,
      image: it.image || '',
      variantSize: it.variantSize || '',
    }));

    const slaTimerStr = `${String(slaMinutes).padStart(2, '0')}:00`;
    try {
      const existingDs = await DarkstoreOrder.findOne({ order_id: orderId }).lean();
      if (!existingDs) {
        await DarkstoreOrder.create({
          order_id: orderId,
          id: orderId,
          store_id: storeId,
          order_type: response.order_type || 'Normal',
          status: 'new',
          item_count: itemCount,
          items: dsItems,
          sla_timer: slaTimerStr,
          sla_status: 'safe',
          sla_deadline: slaDeadline,
          assignee: {},
          customer_name: customerName,
          customer_phone: phoneNumber || '',
          delivery_address: deliveryAddrStr,
          delivery_notes: response.deliveryNotes || '',
          rto_risk: false,
          payment_status: paymentStatus,
          payment_method: dsPaymentMethod,
          total_bill: totalBill,
        });
        try {
          const ph = String(phoneNumber || '');
          const maskedPhone = ph.length >= 8 ? ph.slice(0, 2) + '******' + ph.slice(-2) : ph ? '******' : '';
          const orderEvent = {
            order_id: orderId,
            item_count: itemCount,
            items: dsItems,
            customer_name: customerName,
            customer_phone: maskedPhone,
            delivery_address: deliveryAddrStr,
            store_id: storeId,
            sla_deadline: slaDeadline,
            sla_timer: slaTimerStr,
            sla_status: 'safe',
            status: 'new',
            order_type: 'Normal',
            createdAt: new Date(),
            payment_status: paymentStatus,
            payment_method: dsPaymentMethod,
            total_bill: totalBill,
          };
          websocketService?.broadcastToRole?.('darkstore', 'order:created', orderEvent);
          websocketService?.broadcastToRole?.('admin', 'order:created', orderEvent);
          websocketService?.broadcastToRole?.('finance', 'order:created', orderEvent);
          websocketService?.broadcastToRole?.('picker', 'order:created', orderEvent);
          websocketService?.broadcast?.('order:created', orderEvent);
        } catch (wsErr) {
          console.warn('Websocket order:created broadcast failed (non-blocking):', wsErr?.message);
        }
        try {
          const orderAssignService = require('../../darkstore/services/orderAssignService');
          orderAssignService.tryAutoAssignNewOrder(orderId).catch(() => {});
        } catch (_) {
          /* non-blocking */
        }
      }
    } catch (err) {
      console.warn('Darkstore order create failed (non-blocking):', err.message);
    }

    try {
      const existingWh = await WarehouseOrder.findOne({ order_id: orderId }).lean();
      if (!existingWh) {
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
      }
    } catch (err) {
      console.warn('Warehouse order create failed (non-blocking):', err.message);
    }

    try {
      const paymentType = response.paymentMethod?.type || 'cash';
      const methodDisplay =
        response.paymentMethodDisplay ||
        response.paymentMethod?.detailDisplay ||
        response.paymentMethod?.display ||
        ({
          card: 'Credit/Debit Card',
          upi: 'UPI',
          digital: 'Worldline (UPI/Card)',
          wallet: 'Selorg Wallet',
          cash: 'Cash on Delivery',
        })[paymentType] ||
        paymentType;
      const gatewayRef = paymentType === 'cash' ? `COD-${Date.now()}` : `GW-${Date.now()}`;
      const initialStatus = 'pending';

      try {
        await CustomerPayment.create({
          entityId: 'default',
          customerName: customerName,
          customerEmail: customerEmail || `customer-${userId}@selorg.com`,
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
      const maskedDetails =
        paymentType === 'card' || paymentType === 'digital' ? '****' : paymentType.toUpperCase();
      const gateway = paymentType === 'cash' ? 'cod' : 'worldline';

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
        try {
          const { invalidateFinance } = require('../../finance/cacheInvalidation');
          await invalidateFinance();
        } catch {
          /* non-blocking */
        }
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
  } catch (err) {
    console.warn('Post-order integrations failed (non-blocking):', err.message);
  }
}

/**
 * After verified online payment: coupon, clear cart, ops integrations, notify. Idempotent.
 */
async function releaseOrderFulfillment(orderId) {
  const order = await Order.findById(orderId);
  if (!order) return { error: 'Order not found' };
  // Only explicit false means "not yet released"; legacy docs without the field must not re-run release.
  if (order.fulfillmentReleased !== false) return { skipped: true };
  // A cancelled order must never be released or earn "Order Placed" — this covers
  // late gateway success callbacks/reconciles racing a customer/admin/system cancel.
  if (order.status === 'cancelled') {
    console.warn('[order-service] release skipped: order already cancelled', { orderId: String(orderId) });
    return { skipped: true, reason: 'cancelled' };
  }
  const methodType = order.paymentMethod?.methodType;
  if (methodType !== 'card' && methodType !== 'upi' && methodType !== 'digital') {
    return { error: 'Release only applies to online payment orders' };
  }
  if (order.paymentStatus !== 'paid') {
    return { error: 'Payment not confirmed' };
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (order.checkoutCouponCode) {
        const normalizedCode = String(order.checkoutCouponCode).trim().toUpperCase();
        const couponDoc = await PricingCoupon.findOne({ code: normalizedCode }).session(session);
        if (couponDoc) {
          const existingRedemption = await CouponRedemption.findOne({
            couponId: couponDoc._id,
            userId: order.userId,
            orderId: order._id,
          }).session(session);

          if (!existingRedemption) {
            await CouponRedemption.create(
              [
                {
                  couponId: couponDoc._id,
                  userId: order.userId,
                  orderId: order._id,
                  discountApplied: order.discount || 0,
                },
              ],
              { session }
            );
            await PricingCoupon.updateOne(
              { _id: couponDoc._id },
              { $inc: { usageCount: 1 } },
              { session }
            );
          }
        }
      }

      await clearUserCart(order.userId, session);
    });
  } finally {
    await session.endSession();
  }

  const { invalidateCartGetCache } = require('./cartService');
  await invalidateCartGetCache();

  const populated = await Order.findById(order._id).lean();
  const response = formatOrderForApp({ ...populated, _id: populated._id });
  const userId = String(order.userId);

  await runPostOrderIntegrations(userId, response, 'paid', methodType, order.totalBill);

  // Atomic claim also excludes cancelled orders: if a cancel landed between the
  // status check above and this write, the claim fails and no notification is sent.
  const claim = await Order.updateOne(
    { _id: order._id, fulfillmentReleased: false, status: { $ne: 'cancelled' } },
    { $set: { fulfillmentReleased: true } }
  );

  // Payment is verified and fulfillment released exactly once — this is the only
  // point where an online-payment order earns the "Order Placed" notification.
  if (claim.modifiedCount === 1) {
    try {
      const { sendPaymentOutcomeNotification } = require('./notificationService');
      await sendPaymentOutcomeNotification(order, 'success');
    } catch (e) {
      console.warn('[order-service] order placed notification failed (non-blocking):', e?.message);
    }
  }

  return { ok: true };
}

/**
 * Failed/cancelled online payment before fulfillment: cancel order and restore cart from order lines.
 * @param {'failed'|'cancelled'|'timeout'} [outcome] — verified gateway outcome; drives the customer notification.
 */
async function voidUnpaidOnlineOrder(userId, orderId, reason = '', outcome = 'failed') {
  const { restoreCartFromOrder } = require('./cartService');
  const order = await Order.findOne({
    _id: orderId,
    userId: new mongoose.Types.ObjectId(userId),
  }).lean();
  if (!order) return { error: 'Order not found' };
  const methodType = order.paymentMethod?.methodType;
  if (methodType !== 'card' && methodType !== 'upi' && methodType !== 'digital') {
    return { skipped: true };
  }
  if (order.fulfillmentReleased === true) {
    return { skipped: true };
  }

  // Atomic exactly-once claim of the cancelled transition. A single payment
  // cancel can reach this function from several concurrent paths within the
  // same second (app `complete` call, gateway return URL, browser-return
  // complete, order reconciliation) — a read-then-save check lets every racer
  // through and each one used to emit its own "Payment Cancelled" notification.
  // Only the winner of this update restores the cart and notifies.
  const claimed = await Order.findOneAndUpdate(
    {
      _id: order._id,
      userId: new mongoose.Types.ObjectId(userId),
      status: { $ne: 'cancelled' },
      fulfillmentReleased: { $ne: true },
      paymentStatus: { $ne: 'paid' },
    },
    {
      $set: {
        status: 'cancelled',
        paymentStatus: 'failed',
        cancellationReason: reason || 'Payment failed or cancelled',
      },
      $push: {
        timeline: {
          status: 'cancelled',
          timestamp: new Date(),
          note: reason || 'Payment failed or cancelled',
          actor: 'system',
        },
      },
    },
    { new: true }
  );

  if (!claimed) {
    // Another handler already cancelled this order (its notification was sent
    // then), or the order got paid in the meantime — nothing more to do.
    return { ok: true, skipped: true };
  }

  // Partial wallet: restore funds taken before Worldline when online pay fails.
  try {
    await refundWalletDeductionOnVoid(claimed);
  } catch (e) {
    console.warn('[order-service] wallet deduction refund on void failed (non-blocking):', e?.message);
  }

  await restoreCartFromOrder(userId, claimed);

  // Notify the verified payment outcome — never "Order Placed" here.
  try {
    const { sendPaymentOutcomeNotification } = require('./notificationService');
    const validOutcome = ['failed', 'cancelled', 'timeout'].includes(outcome) ? outcome : 'failed';
    await sendPaymentOutcomeNotification(claimed, validOutcome, { reason: reason || '' });
  } catch (e) {
    console.warn('[order-service] payment outcome notification failed (non-blocking):', e?.message);
  }

  return { ok: true };
}

/**
 * Align `customer_orders` with verified state from `worldline_payments` (latest attempt).
 * Mirrors success/failure handling in worldlinePaymentsService.completePayment so list/detail/active views stay consistent.
 */
async function reconcileOrderWithLatestWorldlinePayment(userId, orderLean) {
  if (!orderLean?._id) return;
  const methodType = orderLean.paymentMethod?.methodType;
  if (!isGatewayPrepayment(methodType)) return;

  const orderId = String(orderLean._id);
  const latest = await WorldlinePayment.findOne({
    orderId: new mongoose.Types.ObjectId(orderId),
    standaloneCheckout: { $ne: true },
  })
    .sort({ attemptNo: -1 })
    .lean();

  if (!latest) {
    // Online order with no gateway attempt at all: the customer abandoned
    // checkout before a payment session was even created. Without this guard
    // the order stays "pending / awaiting payment" forever and keeps being
    // returned as the active order.
    const ttlMinutes = parseInt(process.env.PENDING_PAYMENT_TTL_MINUTES || '30', 10);
    const ageMs = Date.now() - new Date(orderLean.createdAt || 0).getTime();
    if (
      orderLean.status === 'pending' &&
      orderLean.paymentStatus !== 'paid' &&
      orderLean.fulfillmentReleased === false &&
      ageMs > ttlMinutes * 60 * 1000
    ) {
      try {
        await voidUnpaidOnlineOrder(
          userId,
          orderId,
          'Payment was not completed in time',
          'timeout'
        );
      } catch (e) {
        console.warn('[order-service] stale unpaid order void failed', { orderId, message: e?.message });
      }
    }
    return;
  }

  const order = await Order.findOne({
    _id: orderId,
    userId: new mongoose.Types.ObjectId(userId),
  });
  if (!order) return;

  if (!isGatewayPrepayment(order.paymentMethod?.methodType)) return;

  const verified = latest.verificationError === 'none';

  if (latest.status === 'success' && verified) {
    // Cancelled orders stay cancelled: never flip them to paid or release fulfillment
    // (which would emit "Order Placed"). A captured payment on a cancelled order is
    // an ops/refund concern, not a fulfillment trigger.
    if (order.status === 'cancelled') {
      console.warn('[order-service] verified payment success on cancelled order — refund attention needed', {
        orderId,
        txnId: latest.txnId,
      });
      return;
    }
    if (order.paymentStatus !== 'paid' || !order.paymentMethod?.displayLabel) {
      order.paymentStatus = 'paid';
      try {
        const { inferInstrumentFieldsFromWorldline } = require('../utils/paymentMethodDisplay');
        const fields = inferInstrumentFieldsFromWorldline(latest);
        if (!order.paymentMethod) order.paymentMethod = { methodType: 'digital' };
        if (fields.instrument) order.paymentMethod.instrument = fields.instrument;
        if (fields.displayLabel) order.paymentMethod.displayLabel = fields.displayLabel;
        if (fields.paymentMode) order.paymentMethod.paymentMode = fields.paymentMode;
      } catch (_) {
        /* non-blocking */
      }
      await order.save();
    }
    try {
      await releaseOrderFulfillment(orderId);
    } catch (e) {
      console.warn('[order-service] releaseOrderFulfillment reconcile failed', { orderId, message: e?.message });
    }
    return;
  }

  if ((latest.status === 'failed' || latest.status === 'cancelled') && verified) {
    if (order.fulfillmentReleased !== true) {
      try {
        await voidUnpaidOnlineOrder(
          userId,
          orderId,
          latest.statusMessage || 'Payment failed',
          latest.status === 'cancelled' ? 'cancelled' : 'failed'
        );
      } catch (e) {
        console.warn('[order-service] voidUnpaidOnlineOrder reconcile failed', { orderId, message: e?.message });
      }
    }
    return;
  }

  // Payment row already marked failed/cancelled but hash verification was never
  // recorded (common for abandoned sessions / reconciliation). Still void the
  // unpaid order so Track Order does not keep showing Payment Pending.
  if (
    (latest.status === 'failed' || latest.status === 'cancelled') &&
    order.status === 'pending' &&
    order.paymentStatus !== 'paid' &&
    order.fulfillmentReleased === false
  ) {
    try {
      await voidUnpaidOnlineOrder(
        userId,
        orderId,
        latest.statusMessage || 'Payment failed',
        latest.status === 'cancelled' ? 'cancelled' : 'failed'
      );
    } catch (e) {
      console.warn('[order-service] unpaid order void after failed attempt failed', {
        orderId,
        message: e?.message,
      });
    }
    return;
  }

  // Non-terminal attempt (created/initiated/pending/unknown).
  if (!['success', 'failed', 'cancelled'].includes(latest.status)) {
    const sessionExpired =
      latest.sessionExpiresAt && new Date(latest.sessionExpiresAt).getTime() < Date.now();
    const attemptAgeMs = Date.now() - new Date(latest.createdAt || latest.updatedAt || 0).getTime();
    const ttlMinutes = parseInt(process.env.PENDING_PAYMENT_TTL_MINUTES || '30', 10);
    // created/initiated = the customer never completed the gateway flow. Once
    // the session expired the gateway can no longer finish it — fail + void so
    // the order doesn't sit "awaiting payment" (and keep showing on Track
    // Order) forever. Genuinely gateway-pending attempts (0396/0398) are only
    // failed after 24h, same as the reconciliation cron.
    const abandonedBeforeGateway =
      (latest.status === 'created' || latest.status === 'initiated') &&
      (sessionExpired || (!latest.sessionExpiresAt && attemptAgeMs > ttlMinutes * 60 * 1000));
    const extremelyStale = attemptAgeMs > 24 * 60 * 60 * 1000;

    if (
      (abandonedBeforeGateway || extremelyStale) &&
      order.status === 'pending' &&
      order.paymentStatus !== 'paid' &&
      order.fulfillmentReleased === false
    ) {
      try {
        await WorldlinePayment.updateOne(
          { _id: latest._id, status: latest.status },
          {
            $set: {
              status: 'failed',
              statusMessage: 'Payment session expired without completion',
              verificationSource: 'reconciliation',
            },
          }
        );
        await voidUnpaidOnlineOrder(
          userId,
          orderId,
          'Payment was not completed in time',
          'timeout'
        );
      } catch (e) {
        console.warn('[order-service] expired payment session void failed', { orderId, message: e?.message });
      }
      return;
    }

    // Session expired but not voidable yet → one-time timeout notification.
    try {
      const { maybeNotifyPaymentTimeout } = require('./worldlinePaymentsService');
      await maybeNotifyPaymentTimeout(latest, order);
    } catch (e) {
      console.warn('[order-service] payment timeout reconcile check failed', { orderId, message: e?.message });
    }
  }
}

async function reconcileWorldlinePaymentsForOrderList(userId, ordersLean) {
  if (!ordersLean?.length) return;
  for (const o of ordersLean) {
    if (!isGatewayPrepayment(o.paymentMethod?.methodType)) continue;
    try {
      await reconcileOrderWithLatestWorldlinePayment(userId, o);
    } catch (err) {
      console.warn('[order-service] worldline reconcile failed', { orderId: String(o._id), message: err?.message });
    }
  }
}

async function createOrder(userId, body) {
  const {
    items,
    addressId,
    paymentMethodId,
    paymentMethodType,
    couponCode,
    deliveryTip,
    customerName,
    customerEmail,
    customerPhone,
  } = body || {};
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { error: 'Items required' };
  }
  const address = await CustomerAddress.findOne({ _id: addressId, userId }).lean();
  if (!address) return { error: 'Address not found' };

  let deliveryLatitude = address.latitude;
  let deliveryLongitude = address.longitude;
  if (deliveryLatitude == null || deliveryLongitude == null) {
    const geo = await geocodeAddress(buildDeliveryAddressString(address));
    if (geo) {
      deliveryLatitude = geo.latitude;
      deliveryLongitude = geo.longitude;
    }
  }

  let itemTotal = 0;
  let totalTax = 0;
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
    const stockCheck = await assertStockAllowsAsync(product, qty, 0, 'set');
    if (stockCheck.error) {
      return {
        error: `${product.name || 'Product'}: ${stockCheck.error}`,
      };
    }
    const lineTotal = price * qty;
    const gstRate = product.gstRate || 0;
    const taxAmount = lineTotal * (gstRate / (100 + gstRate));
    
    itemTotal += lineTotal;
    totalTax += taxAmount;

    orderItems.push({
      productId: product._id,
      productName: product.name,
      variantId: line.variantId || '',
      variantSize,
      quantity: qty,
      price,
      originalPrice: product.originalPrice,
      hsnCode: product.hsnCode || '',
      gstRate: gstRate,
      taxAmount: taxAmount,
      image: (product.images && product.images[0]) || '',
    });
  }

  let deliveryFee = 0;
  let handlingCharge = 0;
  let discount = 0;
  let totalBill = itemTotal + deliveryFee + handlingCharge - discount + (deliveryTip || 0);

  const resolvedMethodType = paymentMethodType || (paymentMethodId ? 'card' : 'cash');
  const checkoutCouponCode = couponCode ? String(couponCode).trim().toUpperCase() : '';
  let engineResult = null;
  try {
    engineResult = await calculatePricing({
      userId,
      cartItems: orderItems.map((it) => ({
        productId: String(it.productId),
        variantId: it.variantId || null,
        quantity: it.quantity,
        baseUnitPrice: it.price,
      })),
      couponCode: couponCode || null,
      zone: address?.city || null,
      paymentMethod: resolvedMethodType,
      mode: 'order',
    });

    compareWithLegacy(
      { itemTotal, totalBill },
      engineResult?.totals || {}
    );
  } catch (error) {
    console.warn('[order-service] pricing engine shadow execution failed', {
      userId,
      message: error?.message || String(error),
    });
  }

  if (usePricingEngineForOrders && engineResult?.totals) {
    const safeTotals = engineResult.totals;
    discount = Number(safeTotals.discount) || 0;
    deliveryFee = Number(safeTotals.deliveryFee) || 0;
    handlingCharge = Number(safeTotals.handlingCharge) || 0;
    totalBill = (Number(safeTotals.finalAmount) || 0) + (deliveryTip || 0);
  }

  const orderNumber = await generateOrderNumber();
  const slaMinutes = Math.max(
    10,
    Number(process.env.DEFAULT_DELIVERY_SLA_MINUTES) || 30
  );
  const estimatedDelivery = new Date(Date.now() + slaMinutes * 60 * 1000);

  const matchedStoreObjectId = await resolveStoreId(ADYAR_STORE_ID);

  // --- Selorg Wallet checkout (full or partial) ---
  // Amounts are always computed server-side from live wallet balance + order total.
  let walletDeduction = 0;
  let onlineAmountDue = 0;
  let storedMethodType = resolvedMethodType;
  let storedPaymentMethodId = paymentMethodId || '';
  const walletCheckoutRequested = isWalletCheckoutRequest(resolvedMethodType);

  if (walletCheckoutRequested) {
    const { getOrCreateWallet, roundInr } = require('./walletService');
    const wallet = await getOrCreateWallet(userId);
    if (!wallet.isActive) {
      return { error: 'Selorg Wallet is not available' };
    }
    const balance = roundInr(wallet.balance);
    if (!(balance > 0)) {
      return { error: 'Insufficient wallet balance. Please add money to your Selorg Wallet.' };
    }
    const bill = roundOrderMoney(totalBill);
    walletDeduction = roundOrderMoney(Math.min(balance, bill));
    onlineAmountDue = roundOrderMoney(bill - walletDeduction);
    if (onlineAmountDue <= 0) {
      storedMethodType = 'wallet';
      storedPaymentMethodId = 'selorg_wallet';
      onlineAmountDue = 0;
    } else {
      const minOnline = Number(process.env.WORLDLINE_MIN_AMOUNT_INR) || 1;
      if (onlineAmountDue < minOnline) {
        // Cannot open a Worldline session for a sub-minimum remainder.
        if (balance >= bill) {
          walletDeduction = bill;
          onlineAmountDue = 0;
          storedMethodType = 'wallet';
          storedPaymentMethodId = 'selorg_wallet';
        } else {
          return {
            error:
              `After applying your wallet, the remaining amount (₹${onlineAmountDue}) is below the minimum online payment of ₹${minOnline}. ` +
              'Please add money to your wallet to cover the full order, or pay online without using the wallet.',
          };
        }
      } else {
        storedMethodType = 'digital';
        storedPaymentMethodId = 'wallet_partial_worldline';
      }
    }
  }

  const deferFulfillment = isGatewayPrepayment(storedMethodType);
  // Online: pending until Worldline confirms. Full wallet: paid after atomic debit.
  let paymentStatus = storedMethodType === 'cash' ? 'cod_pending' : 'pending';

  const session = await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async () => {
      const orderObjectId = new mongoose.Types.ObjectId();

      if (walletCheckoutRequested && walletDeduction > 0) {
        const { debitWalletForOrder } = require('./walletService');
        const debit = await debitWalletForOrder(userId, walletDeduction, orderObjectId, {
          session,
          description: `Payment for order ${orderNumber}`,
        });
        if (debit.error) {
          const err = new Error(debit.error);
          err.code = 'WALLET_DEBIT_FAILED';
          throw err;
        }
        if (storedMethodType === 'wallet') {
          paymentStatus = 'paid';
        }
      } else if (storedMethodType === 'wallet') {
        paymentStatus = 'paid';
      }

      const timelineNote =
        storedMethodType === 'wallet'
          ? 'Paid with Selorg Wallet'
          : walletDeduction > 0
            ? 'Partial wallet payment — awaiting online payment for remainder'
            : deferFulfillment
              ? 'Awaiting payment'
              : 'Order placed';

      const createdOrders = await Order.create(
        [
          {
            _id: orderObjectId,
            userId: new mongoose.Types.ObjectId(userId),
            orderNumber,
            items: orderItems,
            status: 'pending',
            timeline: [
              {
                status: 'pending',
                timestamp: new Date(),
                note: timelineNote,
                actor: 'customer',
              },
            ],
            addressId: address._id,
            storeId: matchedStoreObjectId || undefined,
            deliveryAddress: {
              line1: address.line1,
              line2: address.line2,
              city: address.city,
              state: address.state,
              pincode: address.pincode,
              landmark: address.label,
              latitude: deliveryLatitude,
              longitude: deliveryLongitude,
            },
            deliveryNotes: body.deliveryNotes || '',
            paymentMethodId: storedPaymentMethodId,
            paymentMethod: {
              methodType: storedMethodType,
              last4: '',
            },
            paymentStatus,
            itemTotal,
            totalTax,
            handlingCharge,
            deliveryFee,
            deliveryTip: deliveryTip || 0,
            discount,
            walletDeduction,
            onlineAmountDue,
            totalBill,
            estimatedDelivery,
            pricingSnapshot: usePricingEngineForOrders ? engineResult : undefined,
            fulfillmentReleased: false,
            checkoutCouponCode: checkoutCouponCode || '',
          },
        ],
        { session }
      );
      order = createdOrders[0];

      if (!deferFulfillment && couponCode) {
        const normalizedCode = String(couponCode).trim().toUpperCase();
        const couponDoc = await PricingCoupon.findOne({ code: normalizedCode }).session(session);
        if (couponDoc) {
          const existingRedemption = await CouponRedemption.findOne({
            couponId: couponDoc._id,
            userId: new mongoose.Types.ObjectId(userId),
            orderId: order._id,
          }).session(session);

          if (!existingRedemption) {
            await CouponRedemption.create(
              [
                {
                  couponId: couponDoc._id,
                  userId: new mongoose.Types.ObjectId(userId),
                  orderId: order._id,
                  discountApplied: discount,
                },
              ],
              { session }
            );
            await PricingCoupon.updateOne(
              { _id: couponDoc._id },
              { $inc: { usageCount: 1 } },
              { session }
            );
          }
        }
      }

      // COD / full wallet: clear cart once persisted.
      // Online / partial wallet: keep cart until releaseOrderFulfillment.
      if (!deferFulfillment) {
        await clearUserCart(userId, session);
      }
    });
  } catch (err) {
    if (
      err?.code === 'WALLET_DEBIT_FAILED' ||
      /insufficient wallet|wallet not available/i.test(err?.message || '')
    ) {
      return { error: err.message || 'Wallet payment failed' };
    }
    throw err;
  } finally {
    await session.endSession();
  }

  const { invalidateCartGetCache } = require('./cartService');
  await invalidateCartGetCache();

  // If checkout provided name/email (including guest checkout), store it on CustomerUser
  // so admin dashboard can reflect it instead of "Unnamed Customer".
  try {
    const { CustomerUser } = require('../models/CustomerUser');
    const providedName = typeof customerName === 'string' ? customerName.trim() : '';
    const providedEmail = typeof customerEmail === 'string' ? customerEmail.trim().toLowerCase() : '';

    if (providedName || providedEmail) {
      const current = await CustomerUser.findById(userId).lean();
      if (current) {
        const update = {};

        if (providedName && (!current.name || String(current.name).trim() === '' || current.name === 'Customer')) {
          update.name = providedName;
        }

        if (providedEmail) {
          const { isPlaceholderCustomerEmail } = require('../utils/customerDisplay');
          const currentEmail = typeof current.email === 'string' ? current.email.trim().toLowerCase() : '';
          const isPlaceholderEmail = isPlaceholderCustomerEmail(currentEmail);

          // Avoid unique email conflicts when another customer already uses it.
          if (isPlaceholderEmail || currentEmail === providedEmail) {
            const other = await CustomerUser.findOne({
              email: providedEmail,
              _id: { $ne: new mongoose.Types.ObjectId(userId) },
            }).lean();
            if (!other) update.email = providedEmail;
          }
        }

        if (Object.keys(update).length > 0) {
          await CustomerUser.updateOne({ _id: userId }, { $set: update });
        }
      }
    }
  } catch (e) {
    // Non-blocking: order creation must succeed even if identity update fails.
    console.warn('[order-service] customer identity update failed (non-blocking)', e?.message || String(e));
  }

  const populated = await Order.findById(order._id).lean();
  const response = formatOrderForApp({ ...populated, _id: populated._id });
  response.debugPricing = engineResult || null;
  response.requiresOnlinePayment = deferFulfillment && onlineAmountDue > 0;
  response.onlineAmountDue = onlineAmountDue;
  response.walletDeduction = walletDeduction;

  if (!deferFulfillment) {
    try {
      await runPostOrderIntegrations(userId, response, paymentStatus, storedMethodType, totalBill);
    } catch (err) {
      console.warn('Post-order integrations failed (non-blocking):', err.message);
    }

    await Order.updateOne({ _id: order._id }, { $set: { fulfillmentReleased: true } });
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

  if (riderId) order.riderId = String(riderId);
  if (newStatus === 'delivered') {
    order.deliveredAt = new Date();
    // COD is collected at handover — delivery completes the payment.
    if (order.paymentStatus === 'cod_pending') order.paymentStatus = 'paid';
  }
  if (newStatus === 'cancelled') {
    order.cancellationReason = note || 'Order cancelled';
  }

  await order.save();

  try {
    const { sendOrderStatusNotification } = require('./notificationService');
    await sendOrderStatusNotification(order, newStatus, {
      actor: actor || STATUS_ACTOR_MAP[newStatus] || 'system',
    });
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

  await reconcileOrderWithLatestWorldlinePayment(userId, order);
  order = await Order.findOne({ _id: order._id, userId: new mongoose.Types.ObjectId(userId) }).lean();
  if (!order) return null;

  // A checkout the customer abandoned long ago (online order that was voided
  // for an unpaid/expired payment) must not resurface on Track Order as a
  // "recent" cancellation — for the customer, no order was ever placed.
  // Fresh payment failures (order created within the last hour) still show
  // the Payment Failed screen; order details/history keep the record either way.
  if (
    order.status === 'cancelled' &&
    order.paymentStatus === 'failed' &&
    isGatewayPrepayment(order.paymentMethod?.methodType) &&
    Date.now() - new Date(order.createdAt || 0).getTime() > 60 * 60 * 1000
  ) {
    return null;
  }

  return buildTrackingPayload(order);
}

/**
 * Real-time tracking payload for a specific order owned by the user.
 * Same shape as the active-order payload: status, paymentStatus, items,
 * timeline, delivery address, store/home coordinates, rider details and
 * live location, plus the remaining ETA — all from the database.
 */
async function getOrderTracking(userId, orderId) {
  if (!mongoose.isValidObjectId(orderId)) return null;
  let order = await Order.findOne({
    _id: orderId,
    userId: new mongoose.Types.ObjectId(userId),
  }).lean();
  if (!order) return null;

  await reconcileOrderWithLatestWorldlinePayment(userId, order);
  order = await Order.findOne({
    _id: order._id,
    userId: new mongoose.Types.ObjectId(userId),
  }).lean();
  if (!order) return null;

  return buildTrackingPayload(order);
}

async function buildTrackingPayload(order) {
  const formatted = formatOrderForApp({ ...order, _id: order._id });

  const [storeDetails, addressDetails] = await Promise.all([
    resolveStoreTrackingDetails(order),
    resolveAddressTrackingDetails(order),
  ]);

  if (storeDetails?.coordinates) {
    formatted.storeCoordinates = storeDetails.coordinates;
    formatted.storeName = storeDetails.name || formatted.storeName || '';
    formatted.storeAddress = storeDetails.address || '';
    formatted.storePhone = storeDetails.phone || '';
  }

  if (addressDetails?.coordinates) {
    formatted.addressCoordinates = addressDetails.coordinates;
    formatted.addressLabel = addressDetails.label || 'Home';
  }

  formatted.deliveryAddressLine = buildDeliveryAddressString(order.deliveryAddress);

  // Attach real rider details (RiderV2 first — live GPS from rider app; legacy Rider fallback)
  if (order.riderId) {
    try {
      const riderIdValue = String(order.riderId);
      let partnerAttached = false;

      try {
        const RiderV2 = require('../../rider_v2_backend/src/models/Rider').Rider;
        const v2 = await RiderV2.findOne({ riderId: riderIdValue }).lean();
        if (v2) {
          const initials = String(v2.name || '')
            .split(/\s+/)
            .filter(Boolean)
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();
          const vehicleLabel = [v2.vehicle?.type, v2.vehicle?.number || v2.vehicle?.vehicleNumber]
            .filter(Boolean)
            .join(' · ');
          formatted.deliveryPartner = {
            name: v2.name || '',
            initials: initials || '',
            phone: v2.phoneNumber || '',
            vehicle: vehicleLabel || undefined,
          };
          const loc = v2.currentLocation;
          if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
            formatted.riderLocation = {
              latitude: loc.lat,
              longitude: loc.lng,
              updatedAt: loc.updatedAt || v2.updatedAt || null,
            };
          }
          partnerAttached = true;
        }
      } catch {
        // RiderV2 optional
      }

      if (!partnerAttached) {
        const Rider = require('../../rider/models/Rider');
        const RiderHR = require('../../rider/models/RiderHR');
        const Vehicle = require('../../rider/models/Vehicle');
        const riderQuery = mongoose.isValidObjectId(riderIdValue)
          ? { $or: [{ _id: riderIdValue }, { id: riderIdValue }] }
          : { id: riderIdValue };

        const rider = await Rider.findOne(riderQuery).lean();
        if (rider) {
          let phone = '';
          try {
            const hr = await RiderHR.findOne({ id: rider.id }, { phone: 1 }).lean();
            phone = hr?.phone || '';
          } catch {
            // RiderHR optional
          }

          let vehicleLabel = '';
          try {
            const vehicle = await Vehicle.findOne({
              assignedRiderId: rider.id,
              status: { $ne: 'inactive' },
            })
              .select('type vehicleId')
              .lean();
            if (vehicle) {
              vehicleLabel = [vehicle.type, vehicle.vehicleId].filter(Boolean).join(' · ');
            }
          } catch {
            // Vehicle lookup optional
          }

          formatted.deliveryPartner = {
            name: rider.name || '',
            initials: rider.avatarInitials || '',
            phone,
            vehicle: vehicleLabel || undefined,
          };

          if (rider.location) {
            const lat = rider.location.lat ?? rider.location.latitude;
            const lng = rider.location.lng ?? rider.location.longitude;
            if (typeof lat === 'number' && typeof lng === 'number') {
              formatted.riderLocation = {
                latitude: lat,
                longitude: lng,
                updatedAt:
                  rider.location.updatedAt ||
                  rider.location.lastUpdated ||
                  rider.updatedAt ||
                  null,
              };
            }
          }
        }
      }
    } catch {
      // Rider lookup optional
    }
  }

  // Compute estimated minutes remaining
  if (order.estimatedDelivery) {
    const remaining = Math.max(
      0,
      Math.round((new Date(order.estimatedDelivery).getTime() - Date.now()) / 60000)
    );
    formatted.deliveryTimeMinutes = remaining;
    formatted.estimatedDelivery = new Date(order.estimatedDelivery).toISOString();
  } else {
    formatted.deliveryTimeMinutes = null;
  }

  return formatted;
}

async function reorderItems(userId, orderId) {
  const order = await Order.findOne({ _id: orderId, userId }).lean();
  if (!order) return { error: 'Order not found' };
  if (!order.items || order.items.length === 0) return { error: 'No items to reorder' };

  // Use addItem so each line gets live catalog price + stock checks (no stale
  // order snapshot prices, no out-of-stock products silently added).
  const { addItem } = require('./cartService');
  const added = [];
  const skipped = [];

  for (const item of order.items) {
    const productName = item.productName || 'Item';
    const qty = Math.max(1, Number(item.quantity) || 1);
    const result = await addItem(userId, {
      productId: item.productId,
      variantId: item.variantId || '',
      quantity: qty,
    });
    if (result?.error) {
      skipped.push({
        productId: String(item.productId || ''),
        productName,
        reason: String(result.error),
      });
      continue;
    }
    added.push({
      productId: String(item.productId || ''),
      productName,
      quantity: qty,
    });
  }

  if (added.length === 0) {
    const names = skipped
      .map((s) => s.productName)
      .filter(Boolean)
      .slice(0, 3)
      .join(', ');
    return {
      error: names
        ? `None of the items from this order are available (${names}${skipped.length > 3 ? '…' : ''}).`
        : 'None of the items from this order are currently available.',
      skipped,
      itemsAdded: 0,
    };
  }

  return {
    success: true,
    itemsAdded: added.length,
    added,
    skipped,
  };
}

module.exports = {
  listOrders,
  getOrderById,
  createOrder,
  cancelOrder,
  getActiveOrder,
  getOrderTracking,
  updateCustomerOrderStatus,
  releaseOrderFulfillment,
  voidUnpaidOnlineOrder,
  refundWalletDeductionOnVoid,
  reorderItems,
};
