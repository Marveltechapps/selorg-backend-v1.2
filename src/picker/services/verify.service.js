/**
 * Face verification — POST /verify/face
 *
 * Strict production mode:
 * - Requires an uploaded image payload
 * - Requires a configured real provider
 * - No stochastic/demo responses
 */

const verifyFace = async (req = {}) => {
  const hasImage = (req.file && req.file.buffer) || (req.body && req.body.image);
  if (!hasImage) {
    return {
      success: false,
      verified: false,
      error: 'Missing face image (send multipart "face" or JSON "image" base64)',
    };
  }

  const useReal = String(process.env.PICKER_FACE_PROVIDER || '').toLowerCase() === 'hyperverge';
  if (!useReal) {
    return {
      success: false,
      verified: false,
      error: 'Face verification provider is not configured. Set PICKER_FACE_PROVIDER=hyperverge and provider credentials.',
      isDemoMode: false,
    };
  }

  // Provider wiring is still required before enabling this endpoint in production.
  return {
    success: false,
    verified: false,
    error: 'Face provider integration is pending implementation in verify.service.',
    isDemoMode: false,
  };
};

module.exports = { verifyFace };
