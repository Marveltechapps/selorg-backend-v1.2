/**
 * Upload support attachments to S3, with local disk fallback when S3 is unavailable.
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { uploadBufferToS3 } = require('../../utils/s3Upload');

function getSupportBucket() {
  return (
    process.env.AWS_S3_BUCKET_SUPPORT ||
    process.env.AWS_S3_BUCKET ||
    'selorg-support-attachments'
  );
}

function hasS3Credentials() {
  return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

function sanitizeFileName(name) {
  return String(name || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
}

function extFromMime(mime, originalName) {
  const fromName = path.extname(originalName || '').toLowerCase();
  if (fromName) return fromName;
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'image/png') return '.png';
  return '.jpg';
}

async function uploadLocal(buffer, fileName, mimeType) {
  const uploadsRoot = path.join(process.cwd(), 'uploads', 'support');
  fs.mkdirSync(uploadsRoot, { recursive: true });
  const diskName = `${Date.now()}-${uuidv4().slice(0, 8)}-${sanitizeFileName(fileName)}`;
  const diskPath = path.join(uploadsRoot, diskName);
  fs.writeFileSync(diskPath, buffer);
  const base =
    process.env.SUPPORT_ATTACHMENT_PUBLIC_BASE ||
    process.env.PUBLIC_BASE_URL ||
    `http://localhost:${process.env.PORT || 3333}`;
  const url = `${String(base).replace(/\/$/, '')}/uploads/support/${diskName}`;
  return {
    url,
    fileName,
    mimeType,
    sizeBytes: buffer.length,
  };
}

/**
 * @param {Express.Multer.File} file
 * @param {{ userId?: string, ticketId?: string }} meta
 */
async function uploadSupportFile(file, meta = {}) {
  if (!file?.buffer) {
    throw Object.assign(new Error('No file provided'), { status: 400 });
  }

  const mimeType = file.mimetype || 'application/octet-stream';
  const original = sanitizeFileName(file.originalname || 'attachment');
  const ext = extFromMime(mimeType, original);
  const fileName = `${uuidv4()}${ext}`;
  const folder = `support/${meta.userId || 'anonymous'}/${meta.ticketId || 'new'}`;

  if (hasS3Credentials()) {
    try {
      const url = await uploadBufferToS3(
        file.buffer,
        getSupportBucket(),
        folder,
        fileName,
        mimeType
      );
      return {
        url,
        fileName: original,
        mimeType,
        sizeBytes: file.size || file.buffer.length,
      };
    } catch (err) {
      console.warn('[SupportAttachment] S3 upload failed, falling back to local:', err.message);
    }
  }

  return uploadLocal(file.buffer, original, mimeType);
}

/**
 * Collect files from multer fields `attachment` and `attachments`.
 * @param {Express.Request} req
 */
function collectUploadedFiles(req) {
  const files = [];
  if (Array.isArray(req.files?.attachment)) files.push(...req.files.attachment);
  if (Array.isArray(req.files?.attachments)) files.push(...req.files.attachments);
  if (req.file) files.push(req.file);
  return files;
}

/**
 * @param {Express.Request} req
 * @param {{ userId?: string, ticketId?: string }} meta
 */
async function processSupportUploads(req, meta = {}) {
  const files = collectUploadedFiles(req);
  if (files.length === 0) return [];
  const attachments = [];
  for (const file of files) {
    attachments.push(await uploadSupportFile(file, meta));
  }
  return attachments;
}

module.exports = {
  uploadSupportFile,
  processSupportUploads,
  collectUploadedFiles,
  getSupportBucket,
};
