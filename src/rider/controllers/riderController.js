const riderService = require('../services/riderService');
const cache = require('../../utils/cache');
const { getCachedOrCompute } = require('../../utils/cacheHelper');
const appConfig = require('../../config/app');

const listRiders = async (req, res, next) => {
  try {
    const { status, zone, search, page, limit } = req.query;
    const filters = { status, zone, search };
    const pagination = { page: parseInt(page) || 1, limit: parseInt(limit) || 50 };
    const cacheKey = `riders:${status || 'all'}:${zone || 'all'}:${search || 'all'}:${page || 1}:${limit || 50}`;
    const { value: result } = await getCachedOrCompute(
      cacheKey,
      appConfig.cache.riders,
      () => riderService.listRiders(filters, pagination),
      res
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getRiderById = async (req, res, next) => {
  try {
    const { riderId } = req.params;
    const cacheKey = `rider:${riderId}`;
    const { value: rider } = await getCachedOrCompute(
      cacheKey,
      appConfig.cache.riders,
      () => riderService.getRiderById(riderId),
      res
    );
    res.status(200).json(rider);
  } catch (error) {
    next(error);
  }
};

const updateRider = async (req, res, next) => {
  try {
    const { riderId } = req.params;
    const updateData = req.body;
    
    const rider = await riderService.updateRider(riderId, updateData);
    
    // Invalidate cache - clear all rider-related cache entries
    await cache.del(`rider:${riderId}`);
    await cache.del(`rider:location:${riderId}`);
    await cache.delByPattern('riders:*'); // Clear all list riders cache entries
    await cache.del('distribution'); // Clear distribution cache
    
    res.status(200).json(rider);
  } catch (error) {
    next(error);
  }
};

const getRiderLocation = async (req, res, next) => {
  try {
    const { riderId } = req.params;
    const cacheKey = `rider:location:${riderId}`;
    const { value: location } = await getCachedOrCompute(
      cacheKey,
      appConfig.cache.location,
      () => riderService.getRiderLocation(riderId),
      res
    );
    res.status(200).json(location);
  } catch (error) {
    next(error);
  }
};

const getRiderDistribution = async (req, res, next) => {
  try {
    const cacheKey = 'distribution';
    const { value: distribution } = await getCachedOrCompute(
      cacheKey,
      appConfig.cache.riders,
      () => riderService.getRiderDistribution(),
      res
    );
    res.status(200).json(distribution);
  } catch (error) {
    next(error);
  }
};

const createRider = async (req, res, next) => {
  try {
    const riderData = req.body;
    
    const rider = await riderService.createRider(riderData);
    
    // Invalidate all rider-related cache entries
    await cache.delByPattern('riders:*');
    await cache.del('distribution');
    
    res.status(201).json(rider);
  } catch (error) {
    if (error.code === 11000) {
      const duplicateError = new Error('Rider with this ID already exists');
      duplicateError.statusCode = 400;
      return next(duplicateError);
    }
    next(error);
  }
};

module.exports = {
  listRiders,
  getRiderById,
  updateRider,
  getRiderLocation,
  getRiderDistribution,
  createRider,
};

