const express = require('express');
const router = express.Router();
const {
  getEquipment,
  createEquipment,
  getTasks,
  createTask,
  updateTaskStatus,
  getIotDevices,
} = require('../controllers/maintenanceController');

router.get('/equipment', getEquipment);
router.post('/equipment', createEquipment);
router.get('/tasks', getTasks);
router.post('/tasks', createTask);
router.patch('/tasks/:taskId/status', updateTaskStatus);
router.get('/iot', getIotDevices);

module.exports = router;
