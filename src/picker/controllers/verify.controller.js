/**
 * Verify controller – from frontend YAML (/verify/face).
 * Accepts req.file (multipart "face") or req.body.image (base64); service may use in future.
 */
const verifyService = require('../services/verify.service');

const face = async (req, res, next) => {
  try {
    const result = await verifyService.verifyFace(req);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

module.exports = { face };
