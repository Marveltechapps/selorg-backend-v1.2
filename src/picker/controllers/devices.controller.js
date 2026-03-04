/**
 * Picker app device controller – POST /devices/return, GET /devices/assigned
 */
const devicesService = require('../services/devices.service');
const s3Service = require('../services/s3.service');
const { success, error } = require('../utils/response.util');

async function returnDevice(req, res) {
  try {
    const pickerUserId = req.userId;
    if (!pickerUserId) {
      return error(res, 'Unauthorized', 401);
    }
    const body = { ...req.body };
    // Support multipart: if conditionPhoto file uploaded, use its S3 URL
    if (req.file && req.file.buffer) {
      try {
        const mimetype = req.file.mimetype || 'image/jpeg';
        const ext = mimetype === 'image/png' ? 'png' : 'jpg';
        const key = `device-condition/${pickerUserId}/${Date.now()}.${ext}`;
        body.conditionPhotoUrl = await s3Service.uploadDocument(req.file.buffer, mimetype, key);
      } catch (s3Err) {
        // Continue without photo if S3 fails
      }
    }
    const result = await devicesService.returnDevice(pickerUserId, body);
    return success(res, result, 200);
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : err.message.includes('not assigned') ? 400 : 400;
    return error(res, err.message, status);
  }
}

async function uploadConditionPhoto(req, res) {
  try {
    const pickerUserId = req.userId;
    if (!pickerUserId) {
      return error(res, 'Unauthorized', 401);
    }
    if (!req.file || !req.file.buffer) {
      return error(res, 'No file provided', 400);
    }
    const s3Service = require('../services/s3.service');
    const mimetype = req.file.mimetype || 'image/jpeg';
    const ext = mimetype === 'image/png' ? 'png' : 'jpg';
    const key = `device-condition/${pickerUserId}/${Date.now()}.${ext}`;
    const url = await s3Service.uploadDocument(req.file.buffer, mimetype, key);
    return success(res, { url }, 200);
  } catch (err) {
    return error(res, err.message || 'Upload failed', 500);
  }
}

async function getAssignedDevice(req, res) {
  try {
    const pickerUserId = req.userId;
    if (!pickerUserId) {
      return error(res, 'Unauthorized', 401);
    }
    const device = await devicesService.getAssignedDevice(pickerUserId);
    if (!device) {
      return error(res, 'No device assigned', 404);
    }
    return success(res, device, 200);
  } catch (err) {
    return error(res, err.message, 500);
  }
}

module.exports = { returnDevice, getAssignedDevice, uploadConditionPhoto };
