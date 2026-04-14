/**
 * Training service – Enhanced with video management and watch-time tracking
 * REAL-TIME: default zeros if DB slow; never block.
 */
const User = require('../models/user.model');
const TrainingVideo = require('../models/trainingVideo.model');
const WatchHistory = require('../models/watchHistory.model');
const { withTimeout, DB_TIMEOUT_MS } = require('../utils/realtime.util');

const defaultProgress = { video1: 0, video2: 0, video3: 0, video4: 0 };

/**
 * Get all active training videos with user's progress
 */
const getAllVideos = async (userId) => {
  try {
    // Fetch all active videos
    const videos = await withTimeout(
      TrainingVideo.find({ isActive: true }).sort({ order: 1 }).lean(),
      DB_TIMEOUT_MS,
      []
    );

    if (!videos || videos.length === 0) return [];

    // Fetch user's watch history and training progress
    const [watchHistories, user] = await Promise.all([
      withTimeout(WatchHistory.find({ userId }).lean(), DB_TIMEOUT_MS, []),
      withTimeout(User.findById(userId).select('trainingProgress').lean(), DB_TIMEOUT_MS, null)
    ]);

    const watchHistoryMap = {};
    watchHistories.forEach(history => {
      watchHistoryMap[history.videoId] = history;
    });

    const trainingProgress = (user && user.trainingProgress) || {};

    // Combine video info with progress (completed = WatchHistory OR user.trainingProgress)
    return videos.map(video => {
      const history = watchHistoryMap[video.videoId] || {};
      const fromHistory = !!history.completedAt;
      const fromProgress = trainingProgress[video.videoId] === 100;
      const completed = fromHistory || fromProgress;
      const progress = completed ? 100 : Math.min(99, Math.round((history.watchedSeconds || 0) / video.duration * 100));

      return {
        videoId: video.videoId,
        title: video.title,
        description: video.description,
        duration: video.duration,
        durationDisplay: video.durationDisplay,
        videoUrl: video.videoUrl,
        thumbnailUrl: video.thumbnailUrl,
        order: video.order,
        progress,
        completed,
        watchedSeconds: history.watchedSeconds || 0,
        lastWatchedPosition: history.lastWatchedPosition || 0
      };
    });
  } catch (err) {
    console.warn('[training] getAllVideos fallback:', err?.message);
    return [];
  }
};

/**
 * Get single video with user's progress
 */
const getVideoById = async (userId, videoId) => {
  try {
    const video = await withTimeout(
      TrainingVideo.findOne({ videoId, isActive: true }).lean(),
      DB_TIMEOUT_MS,
      null
    );

    if (!video) throw new Error('Video not found');

    const history = await withTimeout(
      WatchHistory.findOne({ userId, videoId }).lean(),
      DB_TIMEOUT_MS,
      null
    );

    const completed = !!(history && history.completedAt);
    const progress = completed ? 100 : Math.min(99, Math.round(((history?.watchedSeconds || 0) / video.duration) * 100));

    return {
      videoId: video.videoId,
      title: video.title,
      description: video.description,
      duration: video.duration,
      durationDisplay: video.durationDisplay,
      videoUrl: video.videoUrl,
      thumbnailUrl: video.thumbnailUrl,
      order: video.order,
      progress,
      completed,
      watchedSeconds: history?.watchedSeconds || 0,
      lastWatchedPosition: history?.lastWatchedPosition || 0
    };
  } catch (err) {
    console.error('[training] getVideoById error:', err?.message);
    throw err;
  }
};

/**
 * Track watch progress (called every 5-10 seconds from video player)
 */
const trackWatchProgress = async (userId, videoId, watchedSeconds, currentPosition) => {
  try {
    // Verify video exists
    const video = await withTimeout(
      TrainingVideo.findOne({ videoId, isActive: true }).lean(),
      DB_TIMEOUT_MS,
      null
    );

    if (!video) throw new Error('Video not found');

    // Update or create watch history
    const history = await WatchHistory.findOneAndUpdate(
      { userId, videoId },
      {
        $set: {
          watchedSeconds: Math.max(0, watchedSeconds),
          lastWatchedPosition: Math.max(0, currentPosition)
        },
        $push: {
          attempts: {
            startedAt: new Date(),
            watchedSeconds: Math.max(0, watchedSeconds)
          }
        }
      },
      { upsert: true, new: true }
    );

    return { success: true, watchedSeconds: history.watchedSeconds };
  } catch (err) {
    console.warn('[training] trackWatchProgress fallback:', err?.message);
    return { success: false, message: err?.message };
  }
};

/**
 * Complete video - validates watch percentage before marking complete
 */
const completeVideo = async (userId, videoId) => {
  try {
    // Fetch video
    const video = await TrainingVideo.findOne({ videoId, isActive: true });
    if (!video) throw new Error('Video not found');

    // Fetch watch history
    const history = await WatchHistory.findOne({ userId, videoId });
    if (!history) throw new Error('No watch history found');

    // Calculate watch percentage
    const watchPercentage = (history.watchedSeconds / video.duration) * 100;

    // Validate minimum watch percentage
    if (watchPercentage < video.minimumWatchPercentage) {
      throw new Error(`Must watch at least ${video.minimumWatchPercentage}% of the video to complete it`);
    }

    // Mark as completed in watch history
    history.completedAt = new Date();
    if (history.attempts && history.attempts.length > 0) {
      history.attempts[history.attempts.length - 1].completedAt = new Date();
    }
    await history.save();

    // Update user's trainingProgress
    await User.findByIdAndUpdate(userId, {
      [`trainingProgress.${videoId}`]: 100
    });

    // Check if all videos completed
    const allCompleted = await checkAllVideosCompleted(userId);
    if (allCompleted) {
      await User.findByIdAndUpdate(userId, {
        trainingCompleted: true,
        trainingCompletedAt: new Date()
      });
    }

    // Return updated progress
    return await getUserProgress(userId);
  } catch (err) {
    console.error('[training] completeVideo error:', err?.message);
    throw err;
  }
};

/**
 * Check if user has completed all active training videos
 */
const checkAllVideosCompleted = async (userId) => {
  try {
    const videos = await TrainingVideo.find({ isActive: true }).lean();
    const completedHistories = await WatchHistory.find({
      userId,
      completedAt: { $exists: true, $ne: null }
    }).lean();

    const completedVideoIds = new Set(completedHistories.map(h => h.videoId));
    return videos.every(video => completedVideoIds.has(video.videoId));
  } catch (err) {
    console.warn('[training] checkAllVideosCompleted fallback:', err?.message);
    return false;
  }
};

/**
 * Get user's overall progress
 */
const getUserProgress = async (userId) => {
  try {
    const user = await withTimeout(
      User.findById(userId).select('trainingProgress trainingCompleted').lean(),
      DB_TIMEOUT_MS,
      null
    );

    if (!user || !user.trainingProgress) {
      return {
        ...defaultProgress,
        allCompleted: false
      };
    }

    return {
      video1: user.trainingProgress.video1 ?? 0,
      video2: user.trainingProgress.video2 ?? 0,
      video3: user.trainingProgress.video3 ?? 0,
      video4: user.trainingProgress.video4 ?? 0,
      allCompleted: user.trainingCompleted ?? false
    };
  } catch (err) {
    console.warn('[training] getUserProgress fallback:', err?.message);
    return {
      ...defaultProgress,
      allCompleted: false
    };
  }
};

/**
 * Legacy method - Get progress (backward compatibility)
 */
const getProgress = async (userId) => {
  try {
    const user = await withTimeout(
      User.findById(userId).select('trainingProgress').lean(),
      DB_TIMEOUT_MS,
      null
    );
    if (!user || !user.trainingProgress) return defaultProgress;
    const tp = user.trainingProgress;
    return {
      video1: tp.video1 ?? 0,
      video2: tp.video2 ?? 0,
      video3: tp.video3 ?? 0,
      video4: tp.video4 ?? 0,
      ...Object.fromEntries(
        Object.entries(tp).filter(([k]) => !['video1', 'video2', 'video3', 'video4'].includes(k))
      ),
    };
  } catch (err) {
    console.warn('[training] getProgress fallback:', err?.message);
    return defaultProgress;
  }
};

/**
 * Update progress - supports video1..video4 (legacy) and dynamic videoIds (dashboard-managed videos).
 */
/**
 * Final training assessment submission (score-based pass/fail).
 */
const submitAssessment = async (userId, body) => {
  const passingScore =
    body?.passingScore != null ? Math.min(100, Math.max(0, Number(body.passingScore))) : 70;
  const score = Math.min(100, Math.max(0, Number(body?.score) || 0));
  const passed = score >= passingScore;
  return { passed, score, passingScore };
};

const updateProgress = async (userId, body) => {
  const update = {};
  const clamp = (v) => Math.min(100, Math.max(0, v));

  for (const [key, value] of Object.entries(body || {})) {
    if (typeof value !== 'number') continue;
    const val = clamp(value);
    if (['video1', 'video2', 'video3', 'video4'].includes(key)) {
      update[`trainingProgress.${key}`] = val;
    } else if (key && typeof key === 'string' && /^[a-zA-Z0-9_-]+$/.test(key)) {
      update[`trainingProgress.${key}`] = val;
    }
  }

  if (Object.keys(update).length === 0) return getProgress(userId);
  try {
    await withTimeout(User.findByIdAndUpdate(userId, { $set: update }), DB_TIMEOUT_MS);
  } catch (err) {
    console.warn('[training] updateProgress fallback:', err?.message);
  }
  return getProgress(userId);
};

module.exports = {
  getAllVideos,
  getVideoById,
  trackWatchProgress,
  completeVideo,
  getUserProgress,
  getProgress,
  updateProgress,
  submitAssessment,
};
