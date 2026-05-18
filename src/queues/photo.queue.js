/**
 * Photo Queue
 * File: src/queues/photo.queue.js
 *
 * P2.3: Photo processing queue (document uploads, Didit integration)
 */

const logger = require('../core/utils/logger');
const { photoQueue } = require('./queue.config');

const PHOTO_TYPES = {
  KYC_DOCUMENT: 'KYC_DOCUMENT',
  USER_PROFILE: 'USER_PROFILE',
  ORDER_PROOF: 'ORDER_PROOF',
  VEHICLE_DOCUMENT: 'VEHICLE_DOCUMENT'
};

const processPhotoJob = async (job) => {
  const { type, data } = job.data;

  logger.info(`[PhotoQueue] Processing ${type} for user ${data.userId}`);

  try {
    await uploadPhoto(data);

    return {
      success: true,
      photoType: type,
      userId: data.userId,
      uploadedAt: new Date()
    };
  } catch (error) {
    logger.error(`[PhotoQueue] Failed to process ${type}:`, error);
    throw error;
  }
};

const uploadPhoto = async (photoData) => {
  if (!photoData.userId || !photoData.fileUrl) {
    throw new Error('UserId and fileUrl are required');
  }

  return new Promise((resolve) => {
    setTimeout(() => {
      logger.info(`[PhotoQueue] Photo uploaded for user ${photoData.userId}`);
      resolve();
    }, 200);
  });
};

const enqueuePhoto = async (photoType, photoData) => {
  if (!Object.values(PHOTO_TYPES).includes(photoType)) {
    throw new Error(`Invalid photo type: ${photoType}`);
  }

  const job = await photoQueue.add(
    { type: photoType, data: photoData },
    {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true
    }
  );

  logger.info(`[PhotoQueue] Enqueued ${photoType} job ${job.id}`);
  return job;
};

const getPhotoQueueMetrics = async () => {
  const counts = await photoQueue.getCountsByStates(
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

photoQueue.process(processPhotoJob);

module.exports = {
  photoQueue,
  PHOTO_TYPES,
  processPhotoJob,
  enqueuePhoto,
  getPhotoQueueMetrics
};
