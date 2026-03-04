/**
 * Customer Support routes – mounted at /api/v1/customer/support
 * Requires auth; creates tickets and messages with user info from JWT.
 */
const { Router } = require('express');
const auth = require('../middleware/auth');
const supportController = require('../controllers/supportController');

const router = Router();

router.post('/tickets', auth, supportController.createTicket);
router.get('/tickets/:ticketId/messages', auth, supportController.getTicketMessages);
router.post('/tickets/:ticketId/messages', auth, supportController.sendMessage);

module.exports = router;
