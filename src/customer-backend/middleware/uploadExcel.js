const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

function excelFileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mimeType = file.mimetype || '';
  
  // Check both extension and MIME type for better security
  const validExtension = ext === '.xlsx';
  const validMimeType = mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  
  if (!validExtension) {
    return cb(new Error('Only .xlsx files allowed (invalid file extension)'), false);
  }
  
  if (!validMimeType) {
    return cb(new Error('Only .xlsx files allowed (invalid MIME type)'), false);
  }
  
  cb(null, true);
}

function uploadExcel({ maxFileSizeMB }) {
  const maxBytes = Math.max(1, Number(maxFileSizeMB) || 10) * 1024 * 1024;
  const handler = multer({
    storage,
    fileFilter: excelFileFilter,
    limits: { fileSize: maxBytes },
  }).single('file');

  return (req, res, next) => {
    handler(req, res, (err) => {
      if (!err) return next();
      const msg = err?.message || 'File upload failed';
      // 400: file validation / size / parse errors at upload stage
      return res.status(400).json({ success: false, counts: {}, errors: [{ message: msg }] });
    });
  };
}

module.exports = { uploadExcel };

