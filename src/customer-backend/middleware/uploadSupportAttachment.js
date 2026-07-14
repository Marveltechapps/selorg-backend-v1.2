/**
 * Multer middleware for Help & Support attachments.
 * Max 5 MB; JPG, JPEG, PNG, PDF only.
 */
const multer = require('multer');
const path = require('path');

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
]);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.pdf']);

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  if (ALLOWED_MIME.has(mime) || ALLOWED_EXT.has(ext)) {
    cb(null, true);
    return;
  }
  const err = new Error('Invalid file type. Allowed: JPG, JPEG, PNG, PDF');
  err.status = 400;
  err.code = 'INVALID_FILE_TYPE';
  cb(err);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 5 },
  fileFilter,
});

/** Accept `attachment` (single) and/or `attachments` (array). */
const supportAttachmentUpload = upload.fields([
  { name: 'attachment', maxCount: 1 },
  { name: 'attachments', maxCount: 5 },
]);

function supportUploadErrorHandler(err, _req, res, next) {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 5 MB.',
      });
    }
    return res.status(400).json({ success: false, error: err.message });
  }
  if (err.code === 'INVALID_FILE_TYPE' || err.status === 400) {
    return res.status(400).json({ success: false, error: err.message });
  }
  return next(err);
}

module.exports = {
  supportAttachmentUpload,
  supportUploadErrorHandler,
  MAX_BYTES,
  ALLOWED_MIME,
};
