/**
 * Dark store session — register picker at hub and return permanent store OTP.
 */
const pickerDarkStoreService = require('../services/pickerDarkStore.service');

async function registerAtDarkStore(req, res, next) {
  try {
    const storeId = req.body?.storeId ?? req.body?.locationId;
    if (!storeId) {
      return res.status(400).json({
        success: false,
        message: 'storeId or locationId is required',
      });
    }

    const result = await pickerDarkStoreService.registerPickerAtDarkStore(req.userId, storeId);
    return res.status(200).json({
      success: true,
      message: result.isFirstLogin
        ? 'Registered at dark store. Your permanent store OTP has been created.'
        : 'Welcome back. Using your existing store OTP.',
      data: result,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    next(err);
  }
}

async function getPermanentOtp(req, res, next) {
  try {
    const storeId = req.query?.storeId ?? req.query?.locationId ?? req.body?.storeId ?? req.body?.locationId;
    if (!storeId) {
      return res.status(400).json({
        success: false,
        message: 'storeId or locationId is required',
      });
    }

    const result = await pickerDarkStoreService.getPermanentOtpForPicker(req.userId, storeId);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    next(err);
  }
}

module.exports = { registerAtDarkStore, getPermanentOtp };
