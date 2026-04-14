/**
 * Picker account routes controller
 */
const accountService = require('../services/account.service');

const postDeleteRequest = async (req, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const reason = req.body?.reason;
    const result = await accountService.requestAccountDeletion(userId, reason);
    return res.status(200).json({
      success: true,
      message: result.message,
      alreadyPending: result.alreadyPending,
    });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ success: false, message: err.message });
    }
    next(err);
  }
};

module.exports = { postDeleteRequest };
