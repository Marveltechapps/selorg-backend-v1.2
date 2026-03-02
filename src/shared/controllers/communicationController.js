const communicationService = require('../services/communicationService');
const cache = require('../../utils/cache');
const logger = require('../../core/utils/logger');

/**
 * List active chats
 */
const listActiveChats = async (req, res, next) => {
  try {
    const filters = {
      unreadOnly: req.query.unreadOnly === 'true',
    };

    const result = await communicationService.listActiveChats(filters);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get chat details
 */
const getChatDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    const options = {
      limit: parseInt(req.query.limit) || 50,
      before: req.query.before,
    };

    const chat = await communicationService.getChatDetails(id, options);
    res.status(200).json(chat);
  } catch (error) {
    if (error.message === 'Chat not found') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chat not found',
        code: 'CHAT_NOT_FOUND',
      });
    }
    next(error);
  }
};

/**
 * Send message
 */
const sendMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const messageData = req.body;

    if (!messageData.content) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Message content is required',
        code: 'MISSING_CONTENT',
      });
    }

    const message = await communicationService.sendMessage(id, messageData);
    
    // Invalidate cache
    await cache.delByPattern(`communication:chat:${id}:*`);
    await cache.delByPattern('communication:chats:*');
    
    res.status(201).json(message);
  } catch (error) {
    logger.error('Error in sendMessage controller:', error);
    if (error.message === 'Chat not found') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chat not found',
        code: 'CHAT_NOT_FOUND',
      });
    }
    next(error);
  }
};

/**
 * Mark chat as read
 */
const markChatAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await communicationService.markChatAsRead(id);
    
    // Invalidate cache
    await cache.delByPattern(`communication:chat:${id}:*`);
    await cache.delByPattern('communication:chats:*');
    
    res.status(200).json(result);
  } catch (error) {
    logger.error('Error in markChatAsRead controller:', error);
    if (error.message === 'Chat not found') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chat not found',
        code: 'CHAT_NOT_FOUND',
      });
    }
    next(error);
  }
};

/**
 * Create broadcast
 */
const createBroadcast = async (req, res, next) => {
  try {
    const broadcastData = req.body;

    if (!broadcastData.message || !broadcastData.recipients) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Message and recipients are required',
        code: 'MISSING_REQUIRED_FIELDS',
      });
    }

    const broadcast = await communicationService.createBroadcast(broadcastData);
    
    // Invalidate cache
    await cache.delByPattern('communication:broadcasts:*');
    
    res.status(201).json(broadcast);
  } catch (error) {
    logger.error('Error in createBroadcast controller:', error);
    next(error);
  }
};

/**
 * Flag issue
 */
const flagIssue = async (req, res, next) => {
  try {
    const { id } = req.params;
    const flagData = req.body;

    if (!flagData.reason) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Reason is required',
        code: 'MISSING_REASON',
      });
    }

    const result = await communicationService.flagIssue(id, flagData);
    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Chat not found') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chat not found',
        code: 'CHAT_NOT_FOUND',
      });
    }
    next(error);
  }
};

module.exports = {
  listActiveChats,
  getChatDetails,
  sendMessage,
  markChatAsRead,
  createBroadcast,
  flagIssue,
};

