/**
 * Dev-only controller for testing real-time WebSocket events.
 * Only available when NODE_ENV !== 'production'.
 */
const websocketService = require('../../utils/websocket');

const isDevTestAllowed = () =>
  process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEV_TEST_ROUTES === '1' || process.env.ENABLE_DEV_TEST_ROUTES === 'true';

function emitTestOrder(req, res) {
  if (!isDevTestAllowed()) {
    return res.status(404).json({ success: false, error: 'Not available in production' });
  }

  try {
    const orderId = `TEST-${Date.now()}`;
    const event = {
      order_id: orderId,
      item_count: 2,
      items: [{ productName: 'Test Item', quantity: 1, price: 99 }],
      customer_name: 'Test Customer',
      customer_phone: '98******01',
      delivery_address: '123 Test St',
      store_id: req.body?.store_id || process.env.DEFAULT_STORE_ID || 'STORE1',
      sla_deadline: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      sla_status: 'safe',
      status: 'new',
      order_type: 'Normal',
      createdAt: new Date(),
      payment_status: 'pending',
      payment_method: 'cash',
      total_bill: 198,
    };

    websocketService?.broadcastToRole?.('darkstore', 'order:created', event);
    websocketService?.broadcastToRole?.('admin', 'order:created', event);

    res.status(200).json({
      success: true,
      message: `Test order ${orderId} emitted via WebSocket`,
      order_id: orderId,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

function emitTestOrderUpdate(req, res) {
  if (!isDevTestAllowed()) {
    return res.status(404).json({ success: false, error: 'Not available in production' });
  }

  try {
    const { orderId, status } = req.body || {};
    const order_id = orderId || `TEST-${Date.now()}`;

    const event = {
      order_id,
      store_id: req.body?.store_id || process.env.DEFAULT_STORE_ID || 'STORE1',
      status: status || 'ASSIGNED',
      assignee: { id: 'picker1', name: 'Test Picker', initials: 'TP' },
      pickerAssignment: { pickerId: 'picker1', pickerName: 'Test Picker' },
      updated_at: new Date(),
    };

    websocketService?.broadcastToRole?.('darkstore', 'order:updated', event);
    websocketService?.broadcastToRole?.('admin', 'order:updated', event);

    res.status(200).json({
      success: true,
      message: `Test order update for ${order_id} emitted via WebSocket`,
      order_id,
      status: event.status,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { emitTestOrder, emitTestOrderUpdate };
