const Training = require('../models/Training');
const RiderHR = require('../models/RiderHR');
const logger = require('../../core/utils/logger');

const listTrainingProgress = async (filters = {}, pagination = {}) => {
  try {
    const { status, riderId, page = 1, limit = 50 } = { ...filters, ...pagination };

    const query = {};

    if (status) {
      query.status = status;
    }

    if (riderId) {
      query.riderId = riderId;
    }

    const skip = (page - 1) * limit;
    const total = await Training.countDocuments(query);

    const trainings = await Training.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Format as TrainingProgress
    const riders = trainings.map(t => ({
      riderId: t.riderId,
      riderName: t.riderName,
      status: t.status,
      modulesCompleted: t.modulesCompleted,
      totalModules: t.totalModules,
      progressPercentage: t.progressPercentage,
    }));

    return {
      riders,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    };
  } catch (error) {
    logger.error('Error listing training progress:', error);
    throw error;
  }
};

const getRiderTrainingDetails = async (riderId) => {
  try {
    let training = await Training.findOne({ riderId }).lean();

    // If training doesn't exist, create default one
    if (!training) {
      const rider = await RiderHR.findOne({ id: riderId }).lean();
      if (!rider) {
        const error = new Error('Rider not found');
        error.statusCode = 404;
        throw error;
      }

      // Create default training with 5 modules
      const defaultModules = [
        { id: 'MOD-001', name: 'Safety Protocols', completed: false },
        { id: 'MOD-002', name: 'Traffic Rules', completed: false },
        { id: 'MOD-003', name: 'Customer Service', completed: false },
        { id: 'MOD-004', name: 'App Usage', completed: false },
        { id: 'MOD-005', name: 'Emergency Procedures', completed: false },
      ];

      const newTraining = new Training({
        riderId: rider.id,
        riderName: rider.name,
        status: 'not_started',
        modules: defaultModules,
        modulesCompleted: 0,
        totalModules: 5,
        progressPercentage: 0,
      });

      await newTraining.save();
      training = newTraining.toObject();
    }

    return training;
  } catch (error) {
    logger.error('Error getting rider training details:', error);
    throw error;
  }
};

const markTrainingCompleted = async (riderId, notes) => {
  try {
    let training = await Training.findOne({ riderId });

    if (!training) {
      // Get training details first to create if needed
      await getRiderTrainingDetails(riderId);
      training = await Training.findOne({ riderId });
    }

    // Mark all modules as completed
    training.modules.forEach(module => {
      module.completed = true;
      if (!module.completedAt) {
        module.completedAt = new Date();
      }
    });

    training.status = 'completed';
    training.completedAt = new Date();
    training.modulesCompleted = training.modules.length;
    training.progressPercentage = 100;

    await training.save();

    // Update rider training status
    await RiderHR.updateOne(
      { id: riderId },
      { trainingStatus: 'completed' }
    );

    return training.toObject();
  } catch (error) {
    logger.error('Error marking training as completed:', error);
    throw error;
  }
};

module.exports = {
  listTrainingProgress,
  getRiderTrainingDetails,
  markTrainingCompleted,
};

