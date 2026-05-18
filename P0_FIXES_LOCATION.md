# P0 Critical Fixes - File Location Guide
## Backend Implementation Reference
**Backend Location:** `selorg-dashboard-backend-v1.1/`

---

## 📁 ALL IMPLEMENTATION FILES

### P0.1: Picker KYC Webhook Fix
```
Location: src/picker/services/didit.service.js
Status: ✅ UPDATED (Line 34)
Change: Callback URL now includes full API path
Before: ${this.webhookBaseUrl}/didit/webhook
After:  ${this.webhookBaseUrl}/api/v1/picker/didit/webhook
```

### P0.2: Payment Idempotency Middleware
```
Location: src/middleware/idempotency.js (NEW FILE)
Status: ✅ CREATED
Key Functions:
  - idempotencyMiddleware() → Middleware for routes
  - checkPaymentIdempotency() → Database-level check
  - verifyIdempotencyKey() → Key format validation
Dependencies: redis (optional, fallback to in-memory)
```

### P0.3: JWT Token Expiry Enforcement
```
Location: src/middleware/authJWT.js (NEW FILE)
Status: ✅ CREATED
Key Functions:
  - authenticateJWT() → Middleware for protected routes
  - generateToken() → Create new tokens
  - refreshToken() → Refresh endpoint handler
  - checkTokenValidity() → Non-throwing validation
Validates: exp claim, signature, algorithm
```

### P0.4: Database Connection Pooling
```
Location: src/config/db.js (UPDATED)
Status: ✅ UPDATED
Config Changes:
  - maxPoolSize: 50
  - minPoolSize: 10
  - waitQueueTimeoutMS: 5000
  - socketTimeoutMS: 45000
New Functions:
  - setupPoolMonitoring() → Every 30 seconds
  - getPoolStatistics() → Current pool state
  - getConnectionPoolHealth() → Health check
Exports: getConnectionPoolHealth, getPoolStatistics
```

### P0.5: Order Creation Transaction Safety
```
Location: src/customer-backend/services/orderService.js (REQUIRES UPDATE)
Status: ⏳ PENDING IMPLEMENTATION
Required Changes:
  - Wrap createOrder in MongoDB session
  - Atomic inventory reservation
  - Transaction rollback on payment failure
  - Compensation logic for failed operations
See: PHASE_1_CRITICAL_FIXES.md for implementation code
```

---

## 🔗 INTEGRATION POINTS

### Step 1: Add Middleware to Express App
**File:** `src/core/app.js` or main server file

```javascript
const express = require('express');
const { authenticateJWT } = require('./middleware/authJWT');
const { idempotencyMiddleware } = require('./middleware/idempotency');

const app = express();

// Apply idempotency to all payment routes
app.use('/api/*/payment', idempotencyMiddleware);
app.use('/api/*/checkout', idempotencyMiddleware);
app.use('/api/*/refund', idempotencyMiddleware);

// Apply JWT to protected routes
app.use('/api/*/protected', authenticateJWT);
app.use('/api/*/account', authenticateJWT);
app.use('/api/*/orders', authenticateJWT);
```

### Step 2: Update Customer Routes
**File:** `src/customer-backend/routes/` (all route files)

```javascript
const router = require('express').Router();
const { authenticateJWT } = require('../../middleware/authJWT');

// Protected routes
router.get('/orders', authenticateJWT, controller.list);
router.get('/orders/:id', authenticateJWT, controller.getDetail);
router.post('/orders', authenticateJWT, controller.create);
router.post('/orders/:id/cancel', authenticateJWT, controller.cancel);

module.exports = router;
```

### Step 3: Update Payment Routes
**File:** `src/customer-backend/routes/paymentRoutes.js`

```javascript
const router = require('express').Router();
const { idempotencyMiddleware } = require('../../middleware/idempotency');
const { authenticateJWT } = require('../../middleware/authJWT');

// All payment operations require both auth and idempotency
router.post('/checkout', authenticateJWT, idempotencyMiddleware, controller.checkout);
router.post('/process', authenticateJWT, idempotencyMiddleware, controller.process);
router.post('/refund/:id', authenticateJWT, idempotencyMiddleware, controller.refund);

module.exports = router;
```

### Step 4: Add Health Check Endpoint
**File:** `src/core/app.js` or `src/admin/routes/`

```javascript
const { getConnectionPoolHealth } = require('./config/db');

app.get('/health/db-pool', (req, res) => {
  const health = getConnectionPoolHealth();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});
```

### Step 5: Update Auth Routes
**File:** `src/customer-backend/routes/authRoutes.js`

```javascript
const router = require('express').Router();
const { generateToken, refreshToken, authenticateJWT } = require('../../middleware/authJWT');

router.post('/login', controller.login);
router.post('/refresh-token', refreshToken);
router.post('/logout', authenticateJWT, controller.logout);

module.exports = router;
```

---

## 🔐 ENVIRONMENT VARIABLES REQUIRED

Add to `.env` file:

```bash
# JWT Configuration
JWT_SECRET=your-very-long-secure-random-string-minimum-32-characters
JWT_REFRESH_SECRET=another-very-long-secure-random-string-minimum-32-characters
JWT_EXPIRES_IN=24h

# Redis Configuration (for Idempotency)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # Optional, leave empty if no auth
REDIS_DB=0

# Database Configuration (already exists, verify pooling)
MONGO_URI=mongodb://user:pass@host:27017/selorg
# Pool size will be auto-configured in db.js
```

---

## 📊 MONITORING & HEALTH CHECKS

### Database Pool Health
```bash
GET /health/db-pool

Response:
{
  "status": "healthy",
  "pool": {
    "activeConnections": 5,
    "availableConnections": 5,
    "waitingRequests": 0,
    "maxPoolSize": 50,
    "utilization": 10,
    "status": "LOW"
  },
  "timestamp": "2026-05-01T10:30:00Z"
}
```

### Authentication Test
```bash
POST /auth/login
{
  "email": "user@example.com",
  "password": "password"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": "24h",
  "expiresAt": "2026-05-02T10:30:00Z"
}
```

### Idempotency Test
```bash
POST /checkout
Headers: Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

First Request:
Response Headers: X-Idempotency-Cache: miss

Repeated Request (same Idempotency-Key):
Response Headers: X-Idempotency-Cache: hit
(Same response as first request, no duplicate processing)
```

---

## 🧪 QUICK TESTING

### 1. Test Database Pooling
```bash
# Check pool health
curl http://localhost:3000/health/db-pool
```

### 2. Test JWT Expiry
```bash
# Get token
TOKEN=$(curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}' \
  | jq -r '.token')

# Use token (should work)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/orders

# Wait for expiry or generate expired token, then:
# (should return 401 with TOKEN_EXPIRED)
```

### 3. Test Idempotency
```bash
KEY="550e8400-e29b-41d4-a716-446655440000"

# First request
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $KEY" \
  -d '{"items":[...]}' \
  -i

# Repeat same request - should return cached response
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $KEY" \
  -d '{"items":[...]}' \
  -i
```

---

## 📋 DEPLOYMENT CHECKLIST

Before deploying to production:

```
Files Modified:
- [ ] src/config/db.js (updated with pooling)
- [ ] src/picker/services/didit.service.js (fixed callback URL)

Files Created:
- [ ] src/middleware/authJWT.js (P0.3)
- [ ] src/middleware/idempotency.js (P0.2)

Configuration:
- [ ] .env file has JWT_SECRET
- [ ] .env file has REDIS_HOST/PORT
- [ ] Database pooling configured

Integration:
- [ ] Middleware added to app.js
- [ ] Routes updated to use authenticateJWT
- [ ] Payment routes updated to use idempotencyMiddleware
- [ ] Health check endpoint added
- [ ] Auth refresh endpoint added

Testing:
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Load test 50K orders/day
- [ ] Idempotency test passes
- [ ] JWT expiry test passes
- [ ] Database pool health test passes
```

---

## 🚀 DEPLOYMENT ORDER

1. **Deploy P0.4 first** (Database pooling)
   - Verify pool health endpoint works
   - No breaking changes, backward compatible

2. **Deploy P0.3 next** (JWT expiry)
   - Update auth middleware
   - Add refresh endpoint
   - Monitor for auth failures

3. **Deploy P0.2 with** (Idempotency)
   - Add middleware to payment routes
   - Redis must be running
   - Test idempotency with sample payments

4. **Deploy P0.1 anytime** (Didit webhook fix)
   - Just update the callback URL
   - Test with staging KYC flow

5. **Deploy P0.5 later** (Order transactions)
   - More complex implementation
   - Requires service layer updates
   - Test thoroughly in staging first

---

**Last Updated:** May 1, 2026  
**All Files Ready For:** Production Deployment  
**Testing Status:** ⏳ IN PROGRESS

