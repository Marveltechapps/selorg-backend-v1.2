/**
 * User controller – from backend-workflow.yaml (user_profile_upsert, location_type_set, upi_upsert).
 */
const userService = require('../services/user.service');
const { success, error } = require('../utils/response.util');

const getProfile = async (req, res, next) => {
  try {
    const data = await userService.getProfile(req.userId);
    if (!data) return error(res, 'User not found', 404);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const data = await userService.updateProfile(req.userId, req.body);
    if (!data) return error(res, 'User not found', 404);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

const setLocationType = async (req, res, next) => {
  try {
    const { locationType } = req.body || {};
    const data = await userService.setLocationType(req.userId, locationType);
    if (!data) return error(res, 'Invalid locationType', 400);
    success(res, {});
  } catch (err) {
    next(err);
  }
};

const setSelectedShifts = async (req, res, next) => {
  try {
    await userService.setSelectedShifts(req.userId, req.body.selectedShifts);
    success(res, {});
  } catch (err) {
    next(err);
  }
};

const setUpi = async (req, res, next) => {
  try {
    const { upiId, upiName } = req.body || {};
    if (!upiId || !upiName) return error(res, 'upiId and upiName required', 400);
    const upiRegex = /^[\w.-]+@[\w.-]+$/;
    if (!upiRegex.test(String(upiId))) return error(res, 'Invalid UPI ID', 400);
    const data = await userService.setUpi(req.userId, upiId, upiName);
    if (!data) return error(res, 'User not found', 404);
    success(res, {});
  } catch (err) {
    next(err);
  }
};

const getLinkStatus = async (req, res, next) => {
  try {
    const data = await userService.getLinkStatus(req.userId);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

const getContract = async (req, res, next) => {
  try {
    const data = await userService.getContract(req.userId);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

const updateContract = async (req, res, next) => {
  try {
    const data = await userService.updateContract(req.userId, req.body);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

const getEmployment = async (req, res, next) => {
  try {
    const data = await userService.getEmployment(req.userId);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

const updateEmployment = async (req, res, next) => {
  try {
    const data = await userService.updateEmployment(req.userId, req.body);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getProfile,
  updateProfile,
  setLocationType,
  setSelectedShifts,
  setUpi,
  getLinkStatus,
  getContract,
  updateContract,
  getEmployment,
  updateEmployment,
};
