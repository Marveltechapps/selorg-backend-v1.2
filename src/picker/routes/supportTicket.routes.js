/**
 * Support ticket routes – from backend-workflow.yaml (support/tickets GET, POST).
 */
const express = require('express');
const supportTicketController = require('../controllers/supportTicket.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/tickets', requireAuth, supportTicketController.list);
router.post('/tickets', requireAuth, supportTicketController.create);

module.exports = router;
