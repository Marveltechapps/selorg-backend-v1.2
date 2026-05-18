const { Router } = require('express');
const auth = require('../middleware/auth');
const {
  listStores,
  createStore,
  updateStore,
  deleteStore,
  updateInventory,
  syncInventory,
  getInventoryHistory,
  triggerReplenishment,
} = require('../controllers/storeController');

const router = Router();

// Admin middleware - verify admin role
const adminAuth = (req, res, next) => {
  auth(req, res, () => {
    // In production, verify user has admin role
    if (req.user && (req.user.role === 'admin' || req.user.isAdmin)) {
      next();
    } else {
      res.status(403).json({ success: false, error: 'Admin access required' });
    }
  });
};

/**
 * Dark Store Management
 */
router.get('/stores', adminAuth, listStores);
router.post('/stores', adminAuth, createStore);
router.put('/stores/:id', adminAuth, updateStore);
router.delete('/stores/:id', adminAuth, deleteStore);

/**
 * Inventory Management
 */
router.put('/inventory/:storeId', adminAuth, updateInventory);
router.post('/inventory/:storeId/sync', adminAuth, syncInventory);
router.get('/inventory/:storeId/history', adminAuth, getInventoryHistory);
router.post('/inventory/:storeId/replenish', adminAuth, triggerReplenishment);

module.exports = router;
