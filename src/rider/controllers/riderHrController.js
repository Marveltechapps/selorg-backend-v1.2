const riderHrService = require('../services/riderHrService');
const cache = require('../../utils/cache');

const listRiders = async (req, res, next) => {
  try {
    const { status, onboardingStatus, trainingStatus, appAccess, page, limit } = req.query;
    const result = await riderHrService.listRiders(
      { status, onboardingStatus, trainingStatus, appAccess },
      { page, limit }
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getRiderDetails = async (req, res, next) => {
  try {
    const { riderId } = req.params;
    const rider = await riderHrService.getRiderDetails(riderId);
    res.status(200).json(rider);
  } catch (error) {
    next(error);
  }
};

const onboardRider = async (req, res, next) => {
  try {
    const riderData = req.body;
    const rider = await riderHrService.onboardRider(riderData);
    
    // Invalidate all rider-related cache entries to ensure consistency
    await cache.delByPattern('riders:*');
    await cache.del('distribution');
    await cache.delByPattern('hr:*');
    
    res.status(201).json(rider);
  } catch (error) {
    next(error);
  }
};

const updateRider = async (req, res, next) => {
  try {
    const { riderId } = req.params;
    const updateData = req.body;
    const rider = await riderHrService.updateRider(riderId, updateData);
    
    // Invalidate cache to ensure consistency
    await cache.delByPattern('riders:*');
    await cache.del(`rider:${riderId}`);
    await cache.del('distribution');
    await cache.delByPattern('hr:*');
    
    res.status(200).json(rider);
  } catch (error) {
    next(error);
  }
};

const sendReminder = async (req, res, next) => {
  try {
    const { riderId } = req.params;
    const result = await riderHrService.sendReminder(riderId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listRiders,
  getRiderDetails,
  onboardRider,
  updateRider,
  sendReminder,
};

