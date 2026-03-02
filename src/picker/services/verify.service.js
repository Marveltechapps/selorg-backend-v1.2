/**
 * Verify service – from frontend YAML (faceVerification.service.ts).
 * Face verification: accept image via req.file (multipart "face") or req.body.image (base64).
 * Returns success/verified (mock); can be wired to real provider later.
 */
const verifyFace = async (req = {}) => {
  const hasImage = (req.file && req.file.buffer) || (req.body && req.body.image);
  if (!hasImage) {
    return { success: false, verified: false, error: 'Missing face image (send multipart "face" or JSON "image" base64)' };
  }
  return { success: true, verified: true, message: 'Verified' };
};

module.exports = { verifyFace };
