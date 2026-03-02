const jwt = require('jsonwebtoken');
const tokenBlocklist = require('../services/tokenBlocklist');

/**
 * POST /auth/logout - Revoke the current token (add to blocklist).
 * Client should send Authorization: Bearer <token>.
 * No auth required; invalid/expired tokens are still accepted for revocation.
 */
function logout(req, res) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(400).json({
      success: false,
      error: { code: 'TOKEN_REQUIRED', message: 'Authorization Bearer token required for logout.' },
    });
  }

  try {
    const decoded = jwt.decode(token);
    const exp = decoded && decoded.exp;
    if (exp && exp > Math.floor(Date.now() / 1000)) {
      tokenBlocklist.add(token, exp);
    }
  } catch {
    // Ignore decode errors; still respond success so client can clear local state
  }

  res.status(200).json({ success: true, message: 'Logged out successfully.' });
}

module.exports = { logout };
