/**
 * Admin controller for Picker training video CRUD.
 */
const trainingVideoAdminService = require('../services/trainingVideoAdmin.service');

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

module.exports = {
  listVideos,
  getVideoById,
  createVideo,
  updateVideo,
  deleteVideo,
};
