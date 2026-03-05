/**
 * Admin service for Picker training video CRUD.
 * Manages training_videos collection used by Picker app.
 */
const TrainingVideo = require('../../picker/models/trainingVideo.model');

/**
 * List all training videos (including inactive) for admin
 */
async function listVideos() {
  const videos = await TrainingVideo.find({}).sort({ order: 1 }).lean();
  return videos;
}

/**
 * Get single video by ID (MongoDB _id) or videoId
 */
async function getVideoById(idOrVideoId) {
  let video;
  if (/^[0-9a-fA-F]{24}$/.test(idOrVideoId)) {
    video = await TrainingVideo.findById(idOrVideoId).lean();
  }
  if (!video) {
    video = await TrainingVideo.findOne({ videoId: idOrVideoId }).lean();
  }
  return video;
}

/**
 * Create a new training video
 */
async function createVideo(body) {
  const duration = Number(body.duration) || 0;
  const durationDisplay = body.durationDisplay || `${Math.ceil(duration / 60)} min`;
  const video = new TrainingVideo({
    videoId: body.videoId || `video${Date.now()}`,
    title: body.title,
    description: body.description || '',
    duration,
    durationDisplay,
    videoUrl: body.videoUrl,
    thumbnailUrl: body.thumbnailUrl || '',
    order: Number(body.order) ?? 0,
    minimumWatchPercentage: Number(body.minimumWatchPercentage) || 80,
    isActive: body.isActive !== false,
  });
  await video.save();
  return video.toObject();
}

/**
 * Update a training video
 */
async function updateVideo(idOrVideoId, body) {
  let video = await TrainingVideo.findOne(
    /^[0-9a-fA-F]{24}$/.test(idOrVideoId) ? { _id: idOrVideoId } : { videoId: idOrVideoId }
  );
  if (!video) return null;

  if (body.title != null) video.title = body.title;
  if (body.description != null) video.description = body.description;
  if (body.duration != null) {
    video.duration = Number(body.duration);
    if (body.durationDisplay != null) {
      video.durationDisplay = body.durationDisplay;
    } else {
      video.durationDisplay = `${Math.ceil(video.duration / 60)} min`;
    }
  }
  if (body.durationDisplay != null) video.durationDisplay = body.durationDisplay;
  if (body.videoUrl != null) video.videoUrl = body.videoUrl;
  if (body.thumbnailUrl != null) video.thumbnailUrl = body.thumbnailUrl;
  if (body.order != null) video.order = Number(body.order);
  if (body.minimumWatchPercentage != null) video.minimumWatchPercentage = Number(body.minimumWatchPercentage);
  if (typeof body.isActive === 'boolean') video.isActive = body.isActive;

  await video.save();
  return video.toObject();
}

/**
 * Delete a training video
 */
async function deleteVideo(idOrVideoId) {
  const result = await TrainingVideo.findOneAndDelete(
    /^[0-9a-fA-F]{24}$/.test(idOrVideoId) ? { _id: idOrVideoId } : { videoId: idOrVideoId }
  );
  return result != null;
}

module.exports = {
  listVideos,
  getVideoById,
  createVideo,
  updateVideo,
  deleteVideo,
};
