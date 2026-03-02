/**
 * Faq routes – from backend-workflow.yaml (faqs GET).
 */
const express = require('express');
const faqController = require('../controllers/faq.controller');

const router = express.Router();

router.get('/', faqController.list);

module.exports = router;
