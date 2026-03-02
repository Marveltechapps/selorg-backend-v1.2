const ProductionEquipment = require('../models/ProductionEquipment');
const MaintenanceTask = require('../models/MaintenanceTask');
const ProductionIotDevice = require('../models/ProductionIotDevice');
const { generateId } = require('../../utils/helpers');

const getEquipment = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'PROD-001';
    const equipment = await ProductionEquipment.find({ store_id: storeId }).sort({ name: 1 }).lean();
    res.json({ success: true, equipment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const createEquipment = async (req, res) => {
  try {
    const storeId = req.query.storeId || req.body.store_id || process.env.DEFAULT_STORE_ID || 'PROD-001';
    const { name, code, location, category } = req.body;
    if (!name || !code) {
      return res.status(400).json({ success: false, error: 'name and code are required' });
    }
    const equipmentId = `EQ-${Date.now().toString().slice(-6)}`;
    const equipment = new ProductionEquipment({
      equipment_id: equipmentId,
      name,
      code,
      location: location || '',
      category: category || '',
      status: 'operational',
      health: 100,
      store_id: storeId,
    });
    await equipment.save();
    res.status(201).json({ success: true, equipment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getTasks = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'PROD-001';
    const tasks = await MaintenanceTask.find({ store_id: storeId }).sort({ scheduled_date: -1 }).lean();
    res.json({ success: true, tasks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const createTask = async (req, res) => {
  try {
    const storeId = req.query.storeId || req.body.store_id || process.env.DEFAULT_STORE_ID || 'PROD-001';
    const { equipment_id, equipment_name, task_type, priority, scheduled_date, description, estimated_hours } = req.body;
    if (!equipment_id || !equipment_name || !scheduled_date || !description) {
      return res.status(400).json({ success: false, error: 'equipment_id, equipment_name, scheduled_date, description are required' });
    }
    const taskId = `MNT-${Date.now().toString().slice(-6)}`;
    const task = new MaintenanceTask({
      task_id: taskId,
      equipment_id,
      equipment_name,
      task_type: task_type || 'preventive',
      priority: priority || 'medium',
      scheduled_date,
      description,
      estimated_hours: estimated_hours ? parseInt(estimated_hours, 10) : undefined,
      status: 'scheduled',
      store_id: storeId,
    });
    await task.save();
    res.status(201).json({ success: true, task });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const updateTaskStatus = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status, technician } = req.body;
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'PROD-001';

    const update = { status };
    if (technician !== undefined) update.technician = technician;
    if (status === 'completed') {
      update.completed_date = new Date().toISOString().split('T')[0];
    }

    const task = await MaintenanceTask.findOneAndUpdate(
      { task_id: taskId, store_id: storeId },
      update,
      { new: true }
    );
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    if (status === 'completed') {
      const equip = await ProductionEquipment.findOne({ equipment_id: task.equipment_id, store_id: storeId });
      if (equip) {
        equip.status = 'operational';
        equip.last_maintenance = update.completed_date;
        equip.health = Math.min(100, (equip.health || 80) + 10);
        await equip.save();
      }
    } else if (status === 'in-progress') {
      await ProductionEquipment.findOneAndUpdate(
        { equipment_id: task.equipment_id, store_id: storeId },
        { status: 'maintenance' }
      );
    }

    res.json({ success: true, task });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getIotDevices = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'PROD-001';
    const devices = await ProductionIotDevice.find({ store_id: storeId }).sort({ name: 1 }).lean();
    res.json({ success: true, devices });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getEquipment,
  createEquipment,
  getTasks,
  createTask,
  updateTaskStatus,
  getIotDevices,
};
