/**
 * Global error handling middleware – safe, never throws.
 * REAL-TIME: Always send response; never double-send; no unhandled rejections.
 * Logs error in dev so console shows cause of 500s.
 */
const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return;
  const isDev = process.env.NODE_ENV !== 'production';
  try {
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || 'Internal Server Error';
    const code = Math.min(599, Math.max(400, typeof statusCode === 'number' ? statusCode : 500));
    if (code >= 500 && isDev) {
      console.error('[server] Error:', message, err.stack ? '\n' + err.stack : '');
    }
    res.status(code).json({ success: false, error: message });
  } catch (_) {
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

module.exports = { errorHandler };
