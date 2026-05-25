const mongoose = require('mongoose');
const ProductionEquipment = require('../models/ProductionEquipment');
const MaintenanceTask = require('../models/MaintenanceTask');
const ProductionIotDevice = require('../models/ProductionIotDevice');

function decodeParam(value) {
  try {
    return decodeURIComponent(String(value ?? ''));
  } catch {
    return String(value ?? '');
  }
}

function getStoreId(req) {
  return (
    req.query?.storeId ||
    req.query?.factoryId ||
    req.body?.storeId ||
    req.body?.factoryId ||
    req.body?.store_id ||
    process.env.DASHBOARD_HUB_KEY ||
    process.env.DEFAULT_STORE_ID ||
    'chennai-hub'
  );
}

async function findEquipment(storeId, equipmentId) {
  const byCode = await ProductionEquipment.findOne({ equipment_id: equipmentId });
  if (!byCode) return null;
  if (storeId && byCode.store_id && byCode.store_id !== storeId) return null;
  return byCode;
}

function taskMatchesStore(task, storeId) {
  if (!storeId || !task?.store_id) return true;
  return task.store_id === storeId;
}

async function findMaintenanceTask(storeId, taskId) {
  const id = decodeParam(taskId).trim();
  if (!id) return null;

  let task = await MaintenanceTask.findOne({ task_id: id });
  if (!task && mongoose.Types.ObjectId.isValid(id)) {
    task = await MaintenanceTask.findById(id);
  }
  if (!task) return null;
  if (!taskMatchesStore(task, storeId)) return null;
  return task;
}

async function syncEquipmentForTaskStatus(task, status, storeId) {
  if (!task?.equipment_id) return;
  const equip = await ProductionEquipment.findOne({ equipment_id: task.equipment_id });
  if (!equip) return;

  if (status === 'completed') {
    equip.status = 'operational';
    equip.last_maintenance = new Date().toISOString().split('T')[0];
    equip.health = Math.min(100, (equip.health || 80) + 10);
    await equip.save();
  } else if (status === 'in-progress') {
    equip.status = 'maintenance';
    await equip.save();
  }
}

const getEquipment = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const equipment = await ProductionEquipment.find({ store_id: storeId }).sort({ name: 1 }).lean();
    res.json({ success: true, equipment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const createEquipment = async (req, res) => {
  try {
    const storeId = getStoreId(req);
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
    res.status(201).json({ success: true, equipment: equipment.toObject() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const updateEquipment = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { equipmentId } = req.params;
    const { name, code, location, category, status, health } = req.body;

    const equipment = await findEquipment(storeId, equipmentId);
    if (!equipment) {
      return res.status(404).json({ success: false, error: 'Equipment not found' });
    }

    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.status(400).json({ success: false, error: 'name cannot be empty' });
      }
      equipment.name = String(name).trim();
    }
    if (code !== undefined) {
      if (!String(code).trim()) {
        return res.status(400).json({ success: false, error: 'code cannot be empty' });
      }
      equipment.code = String(code).trim();
    }
    if (location !== undefined) equipment.location = String(location);
    if (category !== undefined) equipment.category = String(category);
    if (status !== undefined) {
      const allowed = ['operational', 'maintenance', 'down', 'idle'];
      if (!allowed.includes(status)) {
        return res.status(400).json({ success: false, error: 'invalid status' });
      }
      equipment.status = status;
    }
    if (health !== undefined) equipment.health = Math.max(0, Math.min(100, Number(health)));

    await equipment.save();
    res.json({ success: true, equipment: equipment.toObject() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteEquipment = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { equipmentId } = req.params;

    const equipment = await findEquipment(storeId, equipmentId);
    if (!equipment) {
      return res.status(404).json({ success: false, error: 'Equipment not found' });
    }

    await ProductionEquipment.deleteOne({ _id: equipment._id });
    res.json({ success: true, message: 'Equipment deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getTasks = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const tasks = await MaintenanceTask.find({ store_id: storeId }).sort({ scheduled_date: -1 }).lean();
    res.json({ success: true, tasks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const createTask = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { equipment_id, equipment_name, task_type, priority, scheduled_date, description, estimated_hours } =
      req.body;
    if (!equipment_id || !equipment_name || !scheduled_date || !description) {
      return res.status(400).json({
        success: false,
        error: 'equipment_id, equipment_name, scheduled_date, description are required',
      });
    }

    const equip = await findEquipment(storeId, equipment_id);
    if (!equip) {
      return res.status(400).json({ success: false, error: 'Equipment not found for this factory' });
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
      estimated_hours: estimated_hours != null ? parseInt(estimated_hours, 10) : undefined,
      status: 'scheduled',
      store_id: storeId,
    });
    await task.save();
    res.status(201).json({ success: true, task: task.toObject() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const updateTask = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const taskId = decodeParam(req.params.taskId);
    const {
      equipment_id,
      equipment_name,
      task_type,
      priority,
      scheduled_date,
      description,
      estimated_hours,
      status,
      technician,
    } = req.body;

    const task = await findMaintenanceTask(storeId, taskId);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    if (equipment_id !== undefined) {
      const equip = await findEquipment(storeId, equipment_id);
      if (!equip) {
        return res.status(400).json({ success: false, error: 'Equipment not found for this factory' });
      }
      task.equipment_id = equipment_id;
      task.equipment_name = equipment_name || equip.name;
    } else if (equipment_name !== undefined) {
      task.equipment_name = String(equipment_name).trim();
    }
    if (task_type !== undefined) {
      const allowed = ['preventive', 'corrective', 'breakdown'];
      if (!allowed.includes(task_type)) {
        return res.status(400).json({ success: false, error: 'invalid task_type' });
      }
      task.task_type = task_type;
    }
    if (priority !== undefined) {
      const allowed = ['low', 'medium', 'high', 'critical'];
      if (!allowed.includes(priority)) {
        return res.status(400).json({ success: false, error: 'invalid priority' });
      }
      task.priority = priority;
    }
    if (scheduled_date !== undefined) task.scheduled_date = scheduled_date;
    if (description !== undefined) {
      if (!String(description).trim()) {
        return res.status(400).json({ success: false, error: 'description cannot be empty' });
      }
      task.description = String(description).trim();
    }
    if (estimated_hours !== undefined) {
      task.estimated_hours =
        estimated_hours === null || estimated_hours === ''
          ? undefined
          : parseInt(estimated_hours, 10);
    }
    if (technician !== undefined) task.technician = technician;

    if (status !== undefined) {
      const allowed = ['scheduled', 'in-progress', 'completed', 'overdue'];
      if (!allowed.includes(status)) {
        return res.status(400).json({ success: false, error: 'invalid status' });
      }
      task.status = status;
      if (status === 'completed') {
        task.completed_date = new Date().toISOString().split('T')[0];
      }
      try {
        await syncEquipmentForTaskStatus(task, status, storeId);
      } catch (equipErr) {
        // eslint-disable-next-line no-console
        console.warn('Equipment sync failed for maintenance task:', equipErr.message);
      }
    }

    await task.save();
    res.json({ success: true, task: task.toObject() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const updateTaskStatus = async (req, res) => {
  req.body = { ...req.body, status: req.body.status };
  req.params.taskId = req.params.taskId;
  return updateTask(req, res);
};

const deleteTask = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const taskId = decodeParam(req.params.taskId);

    const task = await findMaintenanceTask(storeId, taskId);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    await MaintenanceTask.deleteOne({ _id: task._id });
    res.json({ success: true, message: 'Maintenance task deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getIotDevices = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const devices = await ProductionIotDevice.find({ store_id: storeId }).sort({ name: 1 }).lean();
    res.json({ success: true, devices });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
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
};
