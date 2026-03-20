const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

function excelFileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext !== '.xlsx') {
    return cb(new Error('Only .xlsx files allowed'), false);
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

