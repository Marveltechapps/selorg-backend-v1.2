/**
 * PushToken controller – from frontend YAML (POST /api/push-tokens).
 */
const pushTokenService = require('../services/pushToken.service');
const { success } = require('../utils/response.util');

const register = async (req, res, next) => {
  try {
    const body = { ...req.body };
    if (req.userId && !body.userId) body.userId = String(req.userId);
    const ok = await pushTokenService.register(body);
    success(res, { registered: ok });
  } catch (err) {
    next(err);
  }
};

module.exports = { register };
