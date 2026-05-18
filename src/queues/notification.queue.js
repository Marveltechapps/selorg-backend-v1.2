/**
 * Notification Queue
 * File: src/queues/notification.queue.js
 *
 * P2.3: Notification processing queue (in-app, push notifications)
 */

const logger = require('../core/utils/logger');
const { notificationQueue } = require('./queue.config');

const NOTIFICATION_TYPES = {
  IN_APP: 'IN_APP',
  PUSH: 'PUSH',
  WEBHOOK: 'WEBHOOK'
};

const processNotificationJob = async (job) => {
  const { type, data } = job.data;

  logger.info(`[NotificationQueue] Processing ${type} for user ${data.userId}`);

  try {
    await sendNotification(data);

    return {
      success: true,
      notificationType: type,
      userId: data.userId,
      sentAt: new Date()
    };
  } catch (error) {
    logger.error(`[NotificationQueue] Failed to send ${type}:`, error);
    throw error;
  }
};

const sendNotification = async (notificationData) => {
  if (!notificationData.userId) {
    throw new Error('UserId is required');
  }

  return new Promise((resolve) => {
    setTimeout(() => {
      logger.info(`[NotificationQueue] Notification sent to user ${notificationData.userId}`);
      resolve();
    }, 50);
  });
};

const enqueueNotification = async (notificationType, notificationData) => {
  if (!Object.values(NOTIFICATION_TYPES).includes(notificationType)) {
    throw new Error(`Invalid notification type: ${notificationType}`);
  }

  const job = await notificationQueue.add(
    { type: notificationType, data: notificationData },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true
    }
  );

  logger.info(`[NotificationQueue] Enqueued ${notificationType} job ${job.id}`);
  return job;
};

const getNotificationQueueMetrics = async () => {
  const counts = await notificationQueue.getCountsByStates(
    'active',
    'waiting',
    'completed',
    'failed'
  );

  return {
    active: counts.active || 0,
    waiting: counts.waiting || 0,
    completed: counts.completed || 0,
    failed: counts.failed || 0
  };
};

notificationQueue.process(processNotificationJob);

module.exports = {
  notificationQueue,
  NOTIFICATION_TYPES,
  processNotificationJob,
  enqueueNotification,
  getNotificationQueueMetrics
};
