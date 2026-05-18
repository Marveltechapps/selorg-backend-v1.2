/**
 * Main Router
 * File: src/routes/index.js
 *
 * P2.1: Routes all requests to appropriate handlers
 * Mounts API version middleware and routes
 */

const express = require('express');
const router = express.Router();

const { apiVersionMiddleware } = require('../middleware/apiVersion.middleware');
const apiV1Routes = require('./api/v1');

// Apply API version tracking middleware to all API requests
router.use('/api', apiVersionMiddleware);

// Mount v1 API routes
router.use('/api/v1', apiV1Routes);

/**
 * Root health check
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Selorg unified backend API',
    version: '2.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * 404 handler for unmatched routes
 */
router.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    path: req.path,
    method: req.method
  });
});

module.exports = router;
