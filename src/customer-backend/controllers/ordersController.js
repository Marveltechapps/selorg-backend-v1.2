const {
  listOrders,
  getOrderById,
  createOrder,
  cancelOrder,
  getActiveOrder,
  updateCustomerOrderStatus,
} = require('../services/orderService');

async function list(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const status = req.query.status || undefined;
    const result = await listOrders(userId, page, limit, status);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('orders list error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function getDetail(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const order = await getOrderById(userId, req.params.id);
    if (!order) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }
    res.status(200).json({ success: true, data: order });
  } catch (err) {
    console.error('orders getDetail error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function create(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const order = await createOrder(userId, req.body);
    if (order.error) {
      res.status(400).json({ success: false, message: order.error });
      return;
    }
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    console.error('orders create error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function cancel(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const order = await cancelOrder(userId, req.params.id, req.body?.reason);
    if (!order) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }
    if (order.error) {
      res.status(400).json({ success: false, message: order.error });
      return;
    }
    res.status(200).json({ success: true, data: order });
  } catch (err) {
    console.error('orders cancel error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function status(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const order = await getOrderById(userId, req.params.id);
    if (!order) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }
    res.status(200).json({ success: true, data: { status: order.status, ...order } });
  } catch (err) {
    console.error('orders status error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function rate(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const { Order } = require('../models/Order');
    const { rating, comment } = req.body;
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, userId },
      { ratingScore: rating, ratingComment: comment || '' },
      { new: true }
    );
    if (!order) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }
    res.status(200).json({ success: true, data: { message: 'Rating recorded', rating: order.ratingScore } });
  } catch (err) {
    console.error('orders rate error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function verifyOtp(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const { otp } = req.body;
    if (!otp) {
      res.status(400).json({ success: false, message: 'OTP required' });
      return;
    }
    const { Order } = require('../models/Order');
    const order = await Order.findOne({ _id: req.params.id, userId });
    if (!order) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }
    if (order.otpVerified) {
      res.status(200).json({ success: true, data: { verified: true, message: 'OTP already verified' } });
      return;
    }
    order.otpAttempts = (order.otpAttempts || 0) + 1;
    if (order.otpAttempts > 5) {
      await order.save();
      res.status(429).json({ success: false, message: 'Too many OTP attempts' });
      return;
    }
    if (order.deliveryOtp === otp) {
      order.otpVerified = true;
      order.status = 'delivered';
      order.deliveredAt = new Date();
      order.timeline.push({ status: 'delivered', timestamp: new Date(), note: 'OTP verified, order delivered', actor: 'rider' });
      await order.save();

      try {
        const { sendOrderStatusNotification } = require('../services/notificationService');
        await sendOrderStatusNotification(order, 'delivered');
      } catch (e) { /* non-blocking */ }

      res.status(200).json({ success: true, data: { verified: true, message: 'OTP verified successfully' } });
    } else {
      await order.save();
      res.status(400).json({ success: false, message: 'Invalid OTP', attemptsRemaining: 5 - order.otpAttempts });
    }
  } catch (err) {
    console.error('orders verifyOtp error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function canCancel(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const { canCustomerCancel } = require('../services/cancellationService');
    const result = await canCustomerCancel(userId, req.params.id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('orders canCancel error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function active(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const order = await getActiveOrder(userId);
    if (!order) {
      res.status(200).json({ success: true, data: null });
      return;
    }
    res.status(200).json({ success: true, data: order });
  } catch (err) {
    console.error('orders active error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function updateStatus(req, res) {
  try {
    const { status: newStatus, actor, note, riderId } = req.body;
    if (!newStatus) {
      res.status(400).json({ success: false, message: 'status is required' });
      return;
    }
    const result = await updateCustomerOrderStatus(req.params.id, newStatus, { actor, note, riderId });
    if (result.error) {
      res.status(400).json({ success: false, message: result.error });
      return;
    }
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('orders updateStatus error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { list, getDetail, create, cancel, status, rate, verifyOtp, canCancel, active, updateStatus };
