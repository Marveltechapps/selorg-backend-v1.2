/**
 * Faq routes – from backend-workflow.yaml (faqs GET).
 * Phase 1 RBAC: Dashboard endpoints for FAQ CRUD will require Admin role.
 */
const express = require('express');
const faqController = require('../controllers/faq.controller');

const router = express.Router();

router.get('/', faqController.list);

module.exports = router;
