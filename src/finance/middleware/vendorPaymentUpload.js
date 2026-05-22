const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_UPLOAD_SIZE, 10) || 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(pdf|doc|docx|jpg|jpeg|png|gif|webp|xls|xlsx|csv)$/i;
    const mimeOk =
      file.mimetype === 'application/pdf' ||
      file.mimetype.startsWith('image/') ||
      file.mimetype.includes('spreadsheet') ||
      file.mimetype.includes('document') ||
      file.mimetype === 'text/csv';
    if (allowed.test(file.originalname) || mimeOk) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, images, Word, Excel, CSV'));
    }
  },
});

module.exports = { vendorPaymentUpload: upload.single('file') };
