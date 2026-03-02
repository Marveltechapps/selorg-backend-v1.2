/**
 * Public Support controller – create tickets from customer/rider apps
 */
const adminSupportService = require('../../admin/services/adminSupportService');

/**
 * POST /support/tickets
 * Create a support ticket from customer or rider app.
 * Body: subject, description?, category?, priority?, customerName, customerEmail, customerPhone?, orderNumber?, source? (customer|rider)
 */
async function createTicket(req, res, next) {
  try {
    const {
      subject,
      description,
      category,
      priority,
      customerName,
      customerEmail,
      customerPhone,
      orderNumber,
      source = 'customer',
    } = req.body;

    if (!subject || !customerName || !customerEmail) {
      return res.status(400).json({
        success: false,
        error: 'subject, customerName, and customerEmail are required',
      });
    }

    // Map message/body to description if provided (rider/picker apps may use different field names)
    const desc = description || req.body.message || '';

    const data = {
      subject: String(subject).trim(),
      description: desc.trim() || subject,
      category: category || 'order',
      priority: priority || 'medium',
      customerName: String(customerName).trim(),
      customerEmail: String(customerEmail).trim(),
      customerPhone: customerPhone ? String(customerPhone).trim() : '',
      orderNumber: orderNumber ? String(orderNumber).trim() : undefined,
      channel: source === 'rider' ? 'rider_app' : 'customer_app',
    };

    const ticket = await adminSupportService.createTicket(data, 'system', 'Customer/Rider');
    return res.status(201).json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createTicket,
};
