/**
 * Customer Authentication Routes — Phase A API Standardization
 * File: src/routes/api/v1/customer/auth.routes.js
 *
 * P2.1: Customer service authentication endpoints
 * 
 * MIGRATED to ResponseFormatter (May 12, 2026)
 * All responses now follow standard format with proper error handling
 */

const express = require('express');
const router = express.Router();
const ResponseFormatter = require('../../../../core/utils/ResponseFormatter');
const { authenticateJWT } = require('../../../../middleware/authJWT');
const { requireRole } = require('../../../../middleware/roleAuth.middleware');

/**
 * POST /api/v1/customer/auth/login
 * Login with email and password
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const validationErrors = [
      !email && { field: 'email', message: 'Email is required' },
      !password && { field: 'password', message: 'Password is required' }
    ].filter(Boolean);

    if (validationErrors.length > 0) {
      return res.status(422).json(
        ResponseFormatter.validationError(validationErrors, 'Login validation failed')
      );
    }

    const authData = {
      token: 'mock_customer_token_v1',
      userType: 'CUSTOMER',
      userId: 'customer_123'
    };

    res.json(ResponseFormatter.success(authData, 'Login successful'));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/customer/auth/register
 * Register new customer
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    const validationErrors = [
      !email && { field: 'email', message: 'Email is required' },
      !password && { field: 'password', message: 'Password is required' },
      !name && { field: 'name', message: 'Name is required' }
    ].filter(Boolean);

    if (validationErrors.length > 0) {
      return res.status(422).json(
        ResponseFormatter.validationError(validationErrors, 'Registration validation failed')
      );
    }

    const newUser = {
      userId: 'customer_new_123',
      email,
      name
    };

    res.status(201).json(ResponseFormatter.success(newUser, 'Customer registered successfully'));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/customer/auth/logout
 * Logout (protected endpoint)
 */
router.post('/logout', authenticateJWT, requireRole('CUSTOMER'), async (req, res, next) => {
  try {
    res.json(ResponseFormatter.success(null, 'Logged out successfully'));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/customer/auth/profile
 * Get current user profile (protected)
 */
router.get('/profile', authenticateJWT, requireRole('CUSTOMER'), async (req, res, next) => {
  try {
    const profile = {
      userId: req.user.userId,
      userType: req.user.userType,
      email: 'customer@example.com'
    };

    res.json(ResponseFormatter.success(profile, 'Profile fetched successfully'));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
