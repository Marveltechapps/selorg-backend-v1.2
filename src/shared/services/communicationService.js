const Chat = require('../../common-models/Chat');
const Message = require('../../common-models/Message');
const Broadcast = require('../../common-models/Broadcast');
const logger = require('../../core/utils/logger');

/**
 * List active chats
 */
const listActiveChats = async (filters = {}) => {
  try {
    const { unreadOnly = false } = filters;

    const query = {};
    if (unreadOnly) {
      query.unreadCount = { $gt: 0 };
    }

    const chats = await Chat.find(query)
      .sort({ lastMessageTime: -1 })
      .lean();

    // Calculate actual unread count from messages for each chat
    const chatsWithUnreadCount = await Promise.all(
      chats.map(async (chat) => {
        const unreadCount = await Message.countDocuments({
          chatId: chat.id,
          read: false,
        });
        return {
          ...chat,
          unreadCount,
        };
      })
    );

    // Filter by unreadOnly if needed (after calculating actual counts)
    const filteredChats = unreadOnly
      ? chatsWithUnreadCount.filter(chat => chat.unreadCount > 0)
      : chatsWithUnreadCount;

    return { chats: filteredChats };
  } catch (error) {
    logger.error('Error listing active chats:', error);
    throw error;
  }
};

/**
 * Get chat details
 */
const getChatDetails = async (chatId, options = {}) => {
  try {
    const { limit = 50, before } = options;

    // Fetch chat and messages in parallel for better performance
    const [chat, messages] = await Promise.all([
      Chat.findOne({ id: chatId }).lean(),
      (async () => {
        const messageQuery = { chatId };
        if (before) {
          messageQuery.createdAt = { $lt: new Date(before) };
        }

        const msgs = await Message.find(messageQuery)
          .sort({ createdAt: -1 })
          .limit(limit)
          .select('id chatId senderId senderName content direction read createdAt')
          .lean();
        
        // Reverse to get chronological order (oldest first)
        msgs.reverse();

        // Add timestamp field for frontend compatibility
        return msgs.map(msg => ({
          ...msg,
          timestamp: msg.createdAt || msg.timestamp,
        }));
      })()
    ]);

    if (!chat) {
      throw new Error('Chat not found');
    }

    return {
      ...chat,
      messages,
    };
  } catch (error) {
    logger.error('Error getting chat details:', error);
    throw error;
  }
};

/**
 * Get chat messages
 */
const getChatMessages = async (chatId, options = {}) => {
  try {
    const { limit = 50, before } = options;

    const messageQuery = { chatId };
    if (before) {
      messageQuery.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(messageQuery)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = messages.length > limit;
    const result = hasMore ? messages.slice(0, limit).reverse() : messages.reverse();

    return {
      messages: result,
      hasMore,
    };
  } catch (error) {
    logger.error('Error getting chat messages:', error);
    throw error;
  }
};

/**
 * Send message
 */
const sendMessage = async (chatId, messageData) => {
  try {
    const chat = await Chat.findOne({ id: chatId });
    if (!chat) {
      throw new Error('Chat not found');
    }

    const message = new Message({
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      chatId,
      senderId: 'dispatch-1', // In real app, get from auth
      senderName: 'Dispatch',
      content: messageData.content,
      direction: 'outgoing',
      read: false,
    });

    await message.save();

    // Update chat
    chat.lastMessage = messageData.content;
    chat.lastMessageTime = new Date();
    await chat.save();

    const messageObj = message.toObject();
    // Add timestamp field for frontend compatibility
    messageObj.timestamp = messageObj.createdAt || messageObj.timestamp;
    
    return messageObj;
  } catch (error) {
    logger.error('Error sending message:', error);
    throw error;
  }
};

/**
 * Mark chat as read
 */
const markChatAsRead = async (chatId) => {
  try {
    const chat = await Chat.findOne({ id: chatId });
    if (!chat) {
      throw new Error('Chat not found');
    }

    await Message.updateMany(
      { chatId, read: false },
      { $set: { read: true } }
    );

    chat.unreadCount = 0;
    await chat.save();

    return { message: 'Chat marked as read' };
  } catch (error) {
    logger.error('Error marking chat as read:', error);
    throw error;
  }
};

/**
 * Create broadcast
 */
const createBroadcast = async (broadcastData) => {
  try {
    const broadcast = new Broadcast({
      id: `broadcast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      message: broadcastData.message,
      recipients: broadcastData.recipients,
      priority: broadcastData.priority || 'normal',
      status: 'pending',
      sentCount: 0,
      failedCount: 0,
    });

    await broadcast.save();

    // In a real implementation, this would send the broadcast to recipients
    // For now, mark as sent
    broadcast.status = 'sent';
    broadcast.sentCount = broadcastData.recipients.length;
    await broadcast.save();

    return broadcast.toObject();
  } catch (error) {
    logger.error('Error creating broadcast:', error);
    throw error;
  }
};

/**
 * Flag issue
 */
const flagIssue = async (chatId, flagData) => {
  try {
    const chat = await Chat.findOne({ id: chatId });
    if (!chat) {
      throw new Error('Chat not found');
    }

    const issueId = `issue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    // In a real implementation, this would create an issue record
    // For now, just return success

    return {
      message: 'Issue flagged successfully',
      issueId,
    };
  } catch (error) {
    logger.error('Error flagging issue:', error);
    throw error;
  }
};

module.exports = {
  listActiveChats,
  getChatDetails,
  getChatMessages,
  sendMessage,
  markChatAsRead,
  createBroadcast,
  flagIssue,
};

