/**
 * Customer Support routes – mounted at /api/v1/customer/support
 * Requires auth; creates tickets and messages with user info from JWT.
 * Supports multipart/form-data for attachments (JPG/JPEG/PNG/PDF, max 5 MB).
 */
const { Router } = require('express');
const auth = require('../middleware/auth');
const supportController = require('../controllers/supportController');
const {
  supportAttachmentUpload,
  supportUploadErrorHandler,
} = require('../middleware/uploadSupportAttachment');

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     SupportAttachment:
 *       type: object
 *       properties:
 *         url: { type: string }
 *         fileName: { type: string }
 *         mimeType: { type: string }
 *         sizeBytes: { type: integer }
 *     SupportTicket:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         ticketNumber: { type: string }
 *         subject: { type: string }
 *         description: { type: string }
 *         category: { type: string, enum: [order, payment, delivery, account, technical, feedback] }
 *         channel: { type: string }
 *         orderNumber: { type: string }
 *         status: { type: string }
 *         attachments:
 *           type: array
 *           items: { $ref: '#/components/schemas/SupportAttachment' }
 * /api/v1/customer/support/tickets/active:
 *   get:
 *     tags: [Customer Support]
 *     summary: Get active live-chat ticket
 *     security: [{ bearerAuth: [] }]
 * /api/v1/customer/support/tickets:
 *   get:
 *     tags: [Customer Support]
 *     summary: List my support tickets
 *     security: [{ bearerAuth: [] }]
 *   post:
 *     tags: [Customer Support]
 *     summary: Create a support ticket (JSON or multipart)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               subject: { type: string }
 *               description: { type: string }
 *               category: { type: string }
 *               orderNumber: { type: string }
 *               channel: { type: string, example: in_app }
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               subject: { type: string }
 *               description: { type: string }
 *               category: { type: string }
 *               orderNumber: { type: string }
 *               channel: { type: string }
 *               attachment: { type: string, format: binary }
 *               attachments: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       201:
 *         description: Ticket created (includes attachment URLs)
 * /api/v1/customer/support/tickets/{ticketId}/messages:
 *   get:
 *     tags: [Customer Support]
 *     summary: List ticket messages
 *     security: [{ bearerAuth: [] }]
 *   post:
 *     tags: [Customer Support]
 *     summary: Send a ticket message (JSON or multipart with attachment)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               message: { type: string }
 *               attachment: { type: string, format: binary }
 * /api/v1/customer/support/tickets/{ticketId}/reopen:
 *   post:
 *     tags: [Customer Support]
 *     summary: Reopen a closed/resolved ticket
 *     security: [{ bearerAuth: [] }]
 */
router.get('/tickets/active', auth, supportController.getActiveChatTicket);
router.get('/tickets', auth, supportController.listMyTickets);
router.post(
  '/tickets',
  auth,
  supportAttachmentUpload,
  supportUploadErrorHandler,
  supportController.createTicket
);
router.post('/tickets/:ticketId/reopen', auth, supportController.reopenTicket);
router.get('/tickets/:ticketId/messages', auth, supportController.getTicketMessages);
router.post(
  '/tickets/:ticketId/messages',
  auth,
  supportAttachmentUpload,
  supportUploadErrorHandler,
  supportController.sendMessage
);

module.exports = router;
