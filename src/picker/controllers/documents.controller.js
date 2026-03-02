/**
 * Documents controller – from frontend YAML (documentService upload/list).
 * When a file is uploaded (multipart), it is sent to S3 first; the S3 URL is then stored in MongoDB.
 */
const documentsService = require('../services/documents.service');
const s3Service = require('../services/s3.service');

const upload = async (req, res, next) => {
  try {
    const userId = req.userId;
    const docType = (req.body.docType || req.query.docType || '').toLowerCase();
    const side = (req.body.side || req.query.side || '').toLowerCase();
    let url = req.body.url || req.body.documentUrl;
    if (!url && req.file && req.file.path) url = req.file.path;
    if (!url && req.file && req.file.location) url = req.file.location;
    if (!url && req.file && req.file.buffer) {
      const mimetype = req.file.mimetype || 'image/jpeg';
      const ext = mimetype === 'image/png' ? 'png' : 'jpg';
      const key = `documents/${userId}/${docType}-${side}-${Date.now()}.${ext}`;
      try {
        url = await s3Service.uploadDocument(req.file.buffer, mimetype, key);
      } catch (s3Err) {
        url = `data:${mimetype};base64,${req.file.buffer.toString('base64')}`;
      }
    }
    if (!url) url = req.body.image ? `data:image/jpeg;base64,${req.body.image}` : '';
    if (!docType || !side || !url) {
      return res.status(400).json({ success: false, error: 'Missing docType, side, or file/url' });
    }
    if (!['aadhar', 'pan'].includes(docType) || !['front', 'back'].includes(side)) {
      return res.status(400).json({ success: false, error: 'Invalid docType or side' });
    }
    const result = await documentsService.upload(userId, docType, side, url);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

const list = async (req, res, next) => {
  try {
    const result = await documentsService.listByUser(req.userId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

module.exports = { upload, list };
