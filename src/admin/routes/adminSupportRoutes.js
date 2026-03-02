/**
 * Admin Support Center routes – mounted at /api/v1/admin/support
 */
const express = require('express');
const adminSupportController = require('../controllers/adminSupportController');

const router = express.Router();

router.get('/tickets', adminSupportController.listTickets);
router.get('/tickets/:id', adminSupportController.getTicket);
router.post('/tickets', adminSupportController.createTicket);
router.patch('/tickets/:id', adminSupportController.updateTicket);
router.post('/tickets/:id/assign', adminSupportController.assignTicket);
router.post('/tickets/:id/notes', adminSupportController.addNote);
router.post('/tickets/:id/close', adminSupportController.closeTicket);

router.get('/agents', adminSupportController.listAgents);
router.get('/categories', adminSupportController.listCategories);
router.get('/canned-responses', adminSupportController.listCannedResponses);
router.get('/sla-metrics', adminSupportController.getSLAMetrics);
router.get('/live-chats', adminSupportController.listLiveChats);

router.get('/faqs', adminSupportController.listFAQs);
router.post('/faqs', adminSupportController.createFAQ);
router.patch('/faqs/:id', adminSupportController.updateFAQ);
router.delete('/faqs/:id', adminSupportController.deleteFAQ);

router.get('/feedback', adminSupportController.listFeedback);

module.exports = router;
