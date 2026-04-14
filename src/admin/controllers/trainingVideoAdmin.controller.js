/**
 * Admin controller for Picker training video CRUD.
 */
const trainingVideoAdminService = require('../services/trainingVideoAdmin.service');
const WatchHistory = require('../../picker/models/watchHistory.model');
const PickerUser = require('../../picker/models/user.model');
const TrainingVideo = require('../../picker/models/trainingVideo.model');

/**
 * GET /admin/training-videos – List all training videos
 */
async function listVideos(req, res, next) {
  try {
    const videos = await trainingVideoAdminService.listVideos();
    res.json({ success: true, data: videos });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/training-videos/:id – Get single video
 */
async function getVideoById(req, res, next) {
  try {
    const video = await trainingVideoAdminService.getVideoById(req.params.id);
    if (!video) {
      return res.status(404).json({ success: false, error: 'Video not found' });
    }
    res.json({ success: true, data: video });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /admin/training-videos – Create video
 */
async function createVideo(req, res, next) {
  try {
    const { title, videoUrl } = req.body;
    if (!title || !videoUrl) {
      return res.status(400).json({ success: false, error: 'title and videoUrl are required' });
    }
    const video = await trainingVideoAdminService.createVideo(req.body);
    res.status(201).json({ success: true, data: video });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, error: 'Video ID already exists' });
    }
    next(err);
  }
}

/**
 * PUT /admin/training-videos/:id – Update video
 */
async function updateVideo(req, res, next) {
  try {
    const video = await trainingVideoAdminService.updateVideo(req.params.id, req.body);
    if (!video) {
      return res.status(404).json({ success: false, error: 'Video not found' });
    }
    res.json({ success: true, data: video });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /admin/training-videos/:id – Delete video
 */
async function deleteVideo(req, res, next) {
  try {
    const deleted = await trainingVideoAdminService.deleteVideo(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Video not found' });
    }
    res.json({ success: true, message: 'Video deleted' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/training-videos/picker-progress
 */
async function getPickerProgress(req, res, next) {
  try {
    const { videoId, status, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const [videos, pickers, watchRows] = await Promise.all([
      TrainingVideo.find({ isActive: true }).sort({ order: 1 }).lean(),
      PickerUser.find({}).select('_id name phone').lean(),
      WatchHistory.find({}).lean(),
    ]);

    const pickerById = Object.fromEntries(pickers.map((picker) => [picker._id.toString(), picker]));
    const rows = [];
    for (const watch of watchRows) {
      const picker = pickerById[String(watch.userId)];
      if (!picker) continue;
      const video = videos.find((item) => item.videoId === watch.videoId);
      if (!video) continue;
      const progress = video.duration > 0 ? Math.min(100, Math.round(((watch.watchedSeconds || 0) / video.duration) * 100)) : 0;
      const rowStatus = watch.completedAt ? 'completed' : progress > 0 ? 'in_progress' : 'not_started';
      rows.push({
        pickerId: picker._id.toString(),
        pickerName: picker.name || '—',
        phone: picker.phone || '—',
        videoId: video.videoId,
        videoTitle: video.title,
        watchPercent: progress,
        completed: !!watch.completedAt,
        completedAt: watch.completedAt || null,
        lastSeen: watch.updatedAt || watch.createdAt || null,
        status: rowStatus,
      });
    }

    let filtered = rows;
    if (videoId) filtered = filtered.filter((row) => row.videoId === videoId);
    if (status && ['completed', 'in_progress', 'not_started'].includes(String(status))) {
      filtered = filtered.filter((row) => row.status === status);
    }

    const start = (pageNum - 1) * limitNum;
    const data = filtered.slice(start, start + limitNum);
    res.json({
      success: true,
      data,
      total: filtered.length,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.max(1, Math.ceil(filtered.length / limitNum)),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listVideos,
  getVideoById,
  createVideo,
  updateVideo,
  deleteVideo,
  getPickerProgress,
};
