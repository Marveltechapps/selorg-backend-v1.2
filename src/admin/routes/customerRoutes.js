const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const asyncHandler = require('../../middleware/asyncHandler');

router.get('/', asyncHandler(customerController.listCustomers));
router.get('/stats', asyncHandler(customerController.getCustomerStats));
router.get('/:id', asyncHandler(customerController.getCustomerById));
router.patch('/:id', asyncHandler(customerController.updateCustomer));
router.get('/:id/orders', asyncHandler(customerController.getCustomerOrders));
router.get('/:id/refunds', asyncHandler(customerController.getCustomerRefunds));
router.get('/:id/tickets', asyncHandler(customerController.getCustomerTickets));
router.get('/:id/risk', asyncHandler(customerController.getCustomerRisk));
router.get('/:id/wallet', asyncHandler(customerController.getCustomerWallet));
router.post('/:id/wallet/credit', asyncHandler(customerController.creditCustomerWallet));
router.get('/:id/addresses', asyncHandler(customerController.getCustomerAddresses));
router.get('/:id/payment-methods', asyncHandler(customerController.getCustomerPaymentMethods));
router.get('/:id/password-info', asyncHandler(customerController.getPasswordInfo));
router.put('/:id/reset-password', asyncHandler(customerController.resetPassword));
router.put('/:id/set-password', asyncHandler(customerController.setPassword));

module.exports = router;
