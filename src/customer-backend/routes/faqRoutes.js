const { Router } = require('express');
const ctrl = require('../controllers/faqController');
const auth = require('../middleware/auth');

const router = Router();

/**
 * @openapi
 * /api/v1/customer/faq:
 *   get:
 *     tags: [Customer FAQ]
 *     summary: List active FAQs with category fields
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *         description: Filter by FAQ category (e.g. Orders, Payments)
 *     responses:
 *       200:
 *         description: FAQ list and category catalog
 * /api/v1/customer/faq/categories:
 *   get:
 *     tags: [Customer FAQ]
 *     summary: List FAQ categories
 * /api/v1/customer/faq/{id}/feedback:
 *   post:
 *     tags: [Customer FAQ]
 *     summary: Submit FAQ helpful / not-helpful feedback
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [helpful]
 *             properties:
 *               helpful: { type: boolean, example: true }
 *     responses:
 *       201:
 *         description: Feedback recorded with updated stats
 *       409:
 *         description: Duplicate vote for this user and FAQ
 */
router.get('/', ctrl.list);
router.get('/categories', ctrl.listCategories);
router.post('/:id/feedback', auth, ctrl.submitFeedback);

module.exports = router;
