/**
 * Picker app: HHD orders (read/update/complete) for the linked HHD user (same person).
 */
const express = require('express');
const { requireAuth } = require('../middlewares/auth.middleware');
const { attachHhdUserId, requireLinkedHhdUser } = require('../helpers/hhdLink.helper');
const controller = require('../controllers/sharedOrders.controller');

const router = express.Router();

router.use(requireAuth);
router.use(attachHhdUserId);
router.use(requireLinkedHhdUser);

router.get('/', controller.getOrders);
router.get('/completed', controller.getCompletedOrders);
router.get('/assignorders', controller.getAssignOrders);
router.get('/:orderId', controller.getOrder);
router.put('/:orderId/status', controller.updateOrderStatus);
router.post('/:orderId/complete', controller.completeOrder);

module.exports = router;
