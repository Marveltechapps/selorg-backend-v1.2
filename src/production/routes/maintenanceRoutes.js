const express = require('express');
const router = express.Router();
const {
  getEquipment,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  getTasks,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  getIotDevices,
} = require('../controllers/maintenanceController');

router.get('/equipment', getEquipment);
router.post('/equipment', createEquipment);
router.put('/equipment/:equipmentId', updateEquipment);
router.delete('/equipment/:equipmentId', deleteEquipment);
router.get('/tasks', getTasks);
router.post('/tasks', createTask);
router.put('/tasks/:taskId', updateTask);
router.patch('/tasks/:taskId/status', updateTaskStatus);
router.delete('/tasks/:taskId', deleteTask);
router.get('/iot', getIotDevices);

module.exports = router;
