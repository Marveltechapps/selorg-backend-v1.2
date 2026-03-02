const express = require('express');
const {
  getZones,
  getZoneById,
  createZone,
  updateZone,
  deleteZone,
  toggleZoneStatus,
  getHistory,
  getOverlaps,
  getStores,
  seedGeofenceData,
} = require('../controllers/geofenceController');

const router = express.Router();

router.route('/zones')
  .get(getZones)
  .post(createZone);

router.route('/zones/:id')
  .get(getZoneById)
  .put(updateZone)
  .patch(toggleZoneStatus)
  .delete(deleteZone);

router.route('/history').get(getHistory);
router.route('/overlaps').get(getOverlaps);
router.route('/stores').get(getStores);
router.route('/seed').post(seedGeofenceData);

module.exports = router;
