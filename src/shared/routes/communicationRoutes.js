const express = require('express');
const router = express.Router();
const communicationController = require('../controllers/communicationController');
const { cacheMiddleware } = require('../../core/middleware');
const appConfig = require('../../config/app');

// Communication endpoints
router.get('/chats', cacheMiddleware(appConfig.cache.communication), communicationController.listActiveChats);
router.get('/chats/:id', cacheMiddleware(appConfig.cache.communication), communicationController.getChatDetails);
router.post('/chats/:id/messages', communicationController.sendMessage);
router.put('/chats/:id/read', communicationController.markChatAsRead);
router.post('/broadcasts', communicationController.createBroadcast);
router.post('/chats/:id/flag', communicationController.flagIssue);

module.exports = router;

