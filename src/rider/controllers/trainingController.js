const trainingService = require('../services/trainingService');

const listTrainingProgress = async (req, res, next) => {
  try {
    const { status, riderId, page, limit } = req.query;
    const result = await trainingService.listTrainingProgress(
      { status, riderId },
      { page, limit }
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getRiderTrainingDetails = async (req, res, next) => {
  try {
    const { riderId } = req.params;
    const training = await trainingService.getRiderTrainingDetails(riderId);
    res.status(200).json(training);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ error: 'Not Found', message: error.message });
    }
    next(error);
  }
};

const markTrainingCompleted = async (req, res, next) => {
  try {
    const { riderId } = req.params;
    const { notes } = req.body;
    const training = await trainingService.markTrainingCompleted(riderId, notes);
    res.status(200).json(training);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ error: 'Not Found', message: error.message });
    }
    next(error);
  }
};

module.exports = {
  listTrainingProgress,
  getRiderTrainingDetails,
  markTrainingCompleted,
};
