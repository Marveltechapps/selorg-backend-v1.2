const express = require('express');
const router = express.Router();
// Reuse vendor auth service (same User model)
const authService = require('../../vendor/services/authService');

router.post('/register', async (req, res, next) => {
  try {
    const payload = req.body;
    const created = await authService.registerUser(payload);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password, role } = req.body;
    const result = await authService.authenticateUser(email, password, role || 'rider');
    if (!result) return res.status(401).json({ code: 401, message: 'Invalid credentials' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
