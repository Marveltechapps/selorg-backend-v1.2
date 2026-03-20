const RiderKit = require('../models/Kit');
const TrainingVideo = require('../../picker/models/trainingVideo.model');

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
