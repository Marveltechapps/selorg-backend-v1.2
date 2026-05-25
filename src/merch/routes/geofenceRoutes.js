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
  getPromoHeatmap,
  getGeofenceStats,
  getStores,
  updateStore,
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
router.route('/heatmap').get(getPromoHeatmap);
router.route('/stats').get(getGeofenceStats);
router.route('/stores').get(getStores);
router.route('/stores/:id').put(updateStore);
router.route('/seed').post(seedGeofenceData);

module.exports = router;
