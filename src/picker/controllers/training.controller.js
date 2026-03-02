/**
 * Training controller – Enhanced with video management and watch-time tracking
 */
const trainingService = require('../services/training.service');
const { success } = require('../utils/response.util');

/**
 * Get all training videos with user's progress
 * GET /training/videos
 */
const getVideos = async (req, res, next) => {
  try {
    const data = await trainingService.getAllVideos(req.userId);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

/**
 * Get single video with user's progress
 * GET /training/videos/:videoId
 */
const getVideoById = async (req, res, next) => {
  try {
    const { videoId } = req.params;
    const data = await trainingService.getVideoById(req.userId, videoId);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

/**
 * Track watch progress
 * PUT /training/watch-progress
 */
const trackWatchProgress = async (req, res, next) => {
  try {
    const { videoId, watchedSeconds, currentPosition } = req.body;
    const data = await trainingService.trackWatchProgress(
      req.userId,
      videoId,
      watchedSeconds,
      currentPosition
    );
    success(res, data);
  } catch (err) {
    next(err);
  }
};

/**
 * Complete video (validates watch time)
 * POST /training/complete/:videoId
 */
const completeVideo = async (req, res, next) => {
  try {
    const { videoId } = req.params;
    const data = await trainingService.completeVideo(req.userId, videoId);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

/**
 * Get user's overall progress
 * GET /training/user-progress
 */
const getUserProgress = async (req, res, next) => {
  try {
    const data = await trainingService.getUserProgress(req.userId);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

/**
 * Legacy: Get progress (backward compatibility)
 * GET /training/progress
 */
const getProgress = async (req, res, next) => {
  try {
    const data = await trainingService.getProgress(req.userId);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

/**
 * Legacy: Update progress (backward compatibility)
 * PUT /training/progress
 */
const updateProgress = async (req, res, next) => {
  try {
    const data = await trainingService.updateProgress(req.userId, req.body);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getVideos,
  getVideoById,
  trackWatchProgress,
  completeVideo,
  getUserProgress,
  getProgress,
  updateProgress
};
