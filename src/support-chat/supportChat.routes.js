const express = require('express');
const { authenticate } = require('../rider_v2_backend/src/middleware/authenticate');
const { authenticateToken, requireRole } = require('../core/middleware');
const service = require('./supportChat.service');

const riderRouter = express.Router();
const adminRouter = express.Router();

function sendError(res, err, fallbackStatus = 500) {
  const msg = err?.message || 'Request failed';
  const status =
    msg === 'Conversation not found' ? 404 : msg === 'Access denied' ? 403 : msg.includes('required') ? 400 : fallbackStatus;
  res.status(status).json({ success: false, error: msg });
}

// —— Rider app (JWT from rider auth) ——
riderRouter.get('/conversation', authenticate, async (req, res) => {
  try {
    const riderId = req.user.id;
    const conversation = await service.getOrCreateConversationForRider(riderId);
    const messages = await service.listMessages(conversation.conversationId, { limit: 80 });
    res.json({
      success: true,
      data: {
        conversation: service.toConversationDto(conversation),
        messages,
      },
    });
  } catch (e) {
    sendError(res, e);
  }
});

riderRouter.get('/conversation/messages', authenticate, async (req, res) => {
  try {
    const riderId = req.user.id;
    const conversation = await service.getOrCreateConversationForRider(riderId);
    const limit = parseInt(req.query.limit, 10) || 50;
    const before = req.query.before;
    const messages = await service.listMessages(conversation.conversationId, { limit, before });
    res.json({ success: true, data: { messages } });
  } catch (e) {
    sendError(res, e);
  }
});

riderRouter.post('/conversation/messages', authenticate, async (req, res) => {
  try {
    const riderId = req.user.id;
    const conversation = await service.getOrCreateConversationForRider(riderId);
    const result = await service.sendMessage({
      conversationId: conversation.conversationId,
      senderType: 'rider',
      senderId: riderId,
      senderName: req.user.name || conversation.riderName,
      body: req.body?.body || req.body?.content || req.body?.message,
      clientMessageId: req.body?.clientMessageId,
    });
    res.json({ success: true, data: result });
  } catch (e) {
    sendError(res, e);
  }
});

riderRouter.post('/conversation/read', authenticate, async (req, res) => {
  try {
    const riderId = req.user.id;
    const conversation = await service.getOrCreateConversationForRider(riderId);
    const updated = await service.markRead(conversation.conversationId, 'rider');
    res.json({ success: true, data: { conversation: updated } });
  } catch (e) {
    sendError(res, e);
  }
});

// —— Rider dashboard admin ——
adminRouter.get('/conversations', async (req, res) => {
  try {
    const conversations = await service.listConversationsForAdmin({
      search: req.query.search,
      status: req.query.status,
      unreadOnly: req.query.unreadOnly === 'true',
    });
    res.json({ success: true, data: { conversations } });
  } catch (e) {
    sendError(res, e);
  }
});

adminRouter.get('/conversations/:conversationId/context', async (req, res) => {
  try {
    const data = await service.getConversationContext(req.params.conversationId);
    if (!data) return res.status(404).json({ success: false, error: 'Conversation not found' });
    res.json({ success: true, data });
  } catch (e) {
    sendError(res, e);
  }
});

adminRouter.get('/conversations/:conversationId', async (req, res) => {
  try {
    const conversation = await service.getConversationById(req.params.conversationId);
    if (!conversation) return res.status(404).json({ success: false, error: 'Conversation not found' });
    const messages = await service.listMessages(conversation.conversationId, {
      limit: parseInt(req.query.limit, 10) || 80,
      before: req.query.before,
    });
    res.json({ success: true, data: { conversation, messages } });
  } catch (e) {
    sendError(res, e);
  }
});

adminRouter.post('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const user = req.user || {};
    const result = await service.sendMessage({
      conversationId: req.params.conversationId,
      senderType: 'admin',
      senderId: user.id || user.userId || 'admin',
      senderName: user.name || user.email || 'Support',
      body: req.body?.body || req.body?.content,
      clientMessageId: req.body?.clientMessageId,
    });
    res.json({ success: true, data: result });
  } catch (e) {
    sendError(res, e);
  }
});

adminRouter.post('/conversations/:conversationId/read', async (req, res) => {
  try {
    const updated = await service.markRead(req.params.conversationId, 'admin');
    res.json({ success: true, data: { conversation: updated } });
  } catch (e) {
    sendError(res, e);
  }
});

adminRouter.patch('/conversations/:conversationId/status', async (req, res) => {
  try {
    const status = req.body?.status;
    if (!['open', 'resolved'].includes(status)) {
      return res.status(400).json({ success: false, error: 'status must be open or resolved' });
    }
    const user = req.user || {};
    const updated = await service.updateStatus(
      req.params.conversationId,
      status,
      user.id || user.userId
    );
    res.json({ success: true, data: { conversation: updated } });
  } catch (e) {
    sendError(res, e);
  }
});

const dashboardAuth = [authenticateToken, requireRole('rider', 'admin', 'super_admin')];
const mountedAdmin = express.Router();
mountedAdmin.use(dashboardAuth);
mountedAdmin.use(adminRouter);

module.exports = { riderRouter, adminRouter: mountedAdmin };
