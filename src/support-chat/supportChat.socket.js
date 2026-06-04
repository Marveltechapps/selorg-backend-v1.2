const logger = require('../core/utils/logger');

function getIO() {
  try {
    const { getIO: getSocketIO } = require('../hhd/config/socket');
    return getSocketIO();
  } catch (e) {
    return null;
  }
}

function emitSupportRealtime(conversation, message) {
  const io = getIO();
  if (!io) return;

  const payload = {
    conversation: {
      conversationId: conversation.conversationId,
      riderId: conversation.riderId,
      riderName: conversation.riderName,
      riderPhone: conversation.riderPhone,
      status: conversation.status,
      lastMessage: conversation.lastMessage,
      lastMessageAt: conversation.lastMessageAt,
      riderUnreadCount: conversation.riderUnreadCount,
      adminUnreadCount: conversation.adminUnreadCount,
    },
    message: message
      ? {
          messageId: message.messageId,
          conversationId: message.conversationId,
          senderType: message.senderType,
          senderId: message.senderId,
          senderName: message.senderName,
          body: message.body,
          clientMessageId: message.clientMessageId,
          createdAt: message.createdAt,
        }
      : null,
  };

  io.to(`support:conversation:${conversation.conversationId}`).emit('support:message', payload);
  io.to('support:admin').emit('support:message', payload);
  io.to('support:admin').emit('support:conversation:updated', payload);
  io.to(`support:rider:${conversation.riderId}`).emit('support:message', payload);
}

function joinSupportRooms(socket) {
  const io = getIO();
  if (!io || !socket) return;

  const tokenRiderId = socket.handshake?.auth?.riderId || socket.riderId;
  if (tokenRiderId) {
    socket.join(`support:rider:${tokenRiderId}`);
  }
  if (socket.userId) {
    socket.join('support:admin');
  }
}

module.exports = { emitSupportRealtime, joinSupportRooms, getIO };
