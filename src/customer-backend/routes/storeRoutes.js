const express = require('express');
const router = express.Router();
const { assignStore, getStoreInventory } = require('../controllers/storeController');
const { optionalAuth } = require('../middleware/optionalAuth');

router.post('/assign', optionalAuth, assignStore);
router.get('/:storeId/inventory', optionalAuth, getStoreInventory);

module.exports = router;
