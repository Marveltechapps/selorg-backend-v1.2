/**
 * Public Support routes – mounted at /api/v1/support
 * POST /tickets – create ticket from customer or rider app (no auth required)
 */
const express = require('express');
const supportController = require('../controllers/supportController');

const router = express.Router();

router.post('/tickets', supportController.createTicket);

module.exports = router;
