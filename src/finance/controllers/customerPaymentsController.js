const customerPaymentsService = require('../services/customerPaymentsService');
const { asyncHandler } = require('../../core/middleware');
const cacheInvalidation = require('../cacheInvalidation');

class CustomerPaymentsController {
  getCustomerPayments = asyncHandler(async (req, res) => {
    const result = await customerPaymentsService.getCustomerPayments(req.query);
    res.json({ success: true, data: result });
  });

  getCustomerPaymentDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payment = await customerPaymentsService.getCustomerPaymentDetails(id);
    res.json({ success: true, data: payment });
  });

  retryCustomerPayment = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { amount } = req.body;
    const payment = await customerPaymentsService.retryCustomerPayment(id, amount);
    await cacheInvalidation.invalidateFinance().catch(() => {});
    res.json({ success: true, data: payment });
  });
}

module.exports = new CustomerPaymentsController();

