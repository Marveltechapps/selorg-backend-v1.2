const RiderKit = require('../models/Kit');
const TrainingVideo = require('../../picker/models/trainingVideo.model');

function toFiniteNumber(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Get the current rider kit configuration
 */
exports.getKitConfig = async (req, res) => {
  try {
    const config = await RiderKit.findOne({ isActive: true }).lean();
    if (!config) {
      // Default fallback
      return res.status(200).json({
        success: true,
        data: {
          title: 'Collect Rider Kit',
          description: 'Please collect your assets from your assigned hub to start delivering.',
          items: [
            { id: 'tshirts', label: '2 T-Shirts', iconName: 'tshirt', isActive: true, order: 1 },
            { id: 'bag', label: 'Delivery Bag', iconName: 'delivery_bag', isActive: true, order: 2 },
            { id: 'idcard', label: 'ID Card', iconName: 'id_card', isActive: true, order: 3 },
          ]
        }
      });
    }
    res.status(200).json({
      success: true,
      data: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch kit configuration',
      error: error.message
    });
  }
};

/**
 * Get active training videos for the rider app
 */
exports.getTrainingVideos = async (req, res) => {
  try {
    // Public (rider app): only active videos
    // Dashboard management uses authenticated CRUD endpoints below.
    const videos = await TrainingVideo.find({ isActive: true }).sort({ order: 1 }).lean();
    res.status(200).json({
      success: true,
      data: videos
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch training videos',
      error: error.message
    });
  }
};

/**
 * Create a training video (rider dashboard)
 */
exports.createTrainingVideo = async (req, res) => {
  try {
    const { title, videoUrl } = req.body || {};
    if (!title || !String(title).trim() || !videoUrl || !String(videoUrl).trim()) {
      return res.status(400).json({ success: false, message: 'title and videoUrl are required' });
    }

    const duration = toFiniteNumber(req.body?.duration, 0);
    const durationDisplay = req.body?.durationDisplay || `${Math.ceil(duration / 60)} min`;
    const video = await TrainingVideo.create({
      videoId: (req.body?.videoId && String(req.body.videoId).trim()) || `video${Date.now()}`,
      title: String(title).trim(),
      description: req.body?.description || '',
      duration,
      durationDisplay,
      videoUrl: String(videoUrl).trim(),
      thumbnailUrl: req.body?.thumbnailUrl || '',
      order: toFiniteNumber(req.body?.order, 0),
      minimumWatchPercentage: toFiniteNumber(req.body?.minimumWatchPercentage, 80),
      isActive: req.body?.isActive !== false,
    });

    res.status(201).json({ success: true, data: video.toObject ? video.toObject() : video });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: 'Video ID already exists' });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to create training video',
      error: error.message
    });
  }
};

/**
 * Update a training video (rider dashboard)
 */
exports.updateTrainingVideo = async (req, res) => {
  try {
    const idOrVideoId = req.params.id;
    const query =
      /^[0-9a-fA-F]{24}$/.test(idOrVideoId) ? { _id: idOrVideoId } : { videoId: idOrVideoId };
    const video = await TrainingVideo.findOne(query);
    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    const body = req.body || {};
    if (body.title != null) video.title = body.title;
    if (body.description != null) video.description = body.description;
    if (body.duration != null) {
      video.duration = toFiniteNumber(body.duration, video.duration);
      if (body.durationDisplay != null) {
        video.durationDisplay = body.durationDisplay;
      } else {
        video.durationDisplay = `${Math.ceil(video.duration / 60)} min`;
      }
    }
    if (body.durationDisplay != null) video.durationDisplay = body.durationDisplay;
    if (body.videoUrl != null) video.videoUrl = body.videoUrl;
    if (body.thumbnailUrl != null) video.thumbnailUrl = body.thumbnailUrl;
    if (body.order != null) video.order = toFiniteNumber(body.order, video.order);
    if (body.minimumWatchPercentage != null) {
      video.minimumWatchPercentage = toFiniteNumber(body.minimumWatchPercentage, video.minimumWatchPercentage || 80);
    }
    if (typeof body.isActive === 'boolean') video.isActive = body.isActive;

    await video.save();
    res.status(200).json({ success: true, data: video.toObject() });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update training video',
      error: error.message
    });
  }
};

/**
 * Delete a training video (rider dashboard)
 */
exports.deleteTrainingVideo = async (req, res) => {
  try {
    const idOrVideoId = req.params.id;
    const query =
      /^[0-9a-fA-F]{24}$/.test(idOrVideoId) ? { _id: idOrVideoId } : { videoId: idOrVideoId };
    const deleted = await TrainingVideo.findOneAndDelete(query).lean();
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }
    res.status(200).json({ success: true, message: 'Video deleted' });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete training video',
      error: error.message
    });
  }
};

/**
 * Update the kit configuration (admin only)
 */
exports.updateKitConfig = async (req, res) => {
  try {
    const { title, description, items } = req.body;
    let config = await RiderKit.findOne({ isActive: true });
    
    if (config) {
      config.title = title || config.title;
      config.description = description || config.description;
      if (items) config.items = items;
      await config.save();
    } else {
      config = await RiderKit.create({
        title,
        description,
        items,
        isActive: true
      });
    }

    res.status(200).json({
      success: true,
      data: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update kit configuration',
      error: error.message
    });
  }
};
