const WarehouseEquipment = require('../models/WarehouseEquipment');
const EquipmentIssue = require('../models/EquipmentIssue');
const ErrorResponse = require("../../core/utils/ErrorResponse");
const { mergeWarehouseFilter, warehouseFieldsForCreate, warehouseKeyMatch } = require('../constants/warehouseScope');

/**
 * @desc Equipment & Assets Service
 */
const equipmentService = {
  listDevices: async (warehouseKey) => {
    const devices = await WarehouseEquipment.find(
      mergeWarehouseFilter({ type: 'hsd-device' }, warehouseKey)
    ).sort({ id: 1 }).lean();
    // Transform to match frontend Device interface
    return devices.map(d => ({
      id: d.id,
      deviceId: d.id,
      user: d.operator || 'Unassigned',
      battery: d.battery || 85 + Math.floor(Math.random() * 15),
      signal: d.signal || (d.status === 'active' ? 'strong' : 'offline'),
      status: d.status === 'active' ? 'active' : d.status === 'charging' ? 'charging' : 'offline'
    }));
  },

  getDeviceById: async (warehouseKey, id) => {
    const device = await WarehouseEquipment.findOne(
      mergeWarehouseFilter({ id, type: 'hsd-device' }, warehouseKey)
    );
    if (!device) throw new ErrorResponse(`Device not found with id ${id}`, 404);
    return device;
  },

  listMachinery: async (warehouseKey) => {
    const machinery = await WarehouseEquipment.find(
      mergeWarehouseFilter({ type: { $ne: 'hsd-device' } }, warehouseKey)
    ).sort({ type: 1, id: 1 }).lean();
    // Transform to match frontend Equipment interface
    return machinery.map(m => ({
      id: m.id,
      equipmentId: m.id,
      name: m.name,
      type: m.type === 'forklift' ? 'forklift' : m.type === 'pallet-jack' ? 'pallet-jack' : 'crane',
      zone: m.zone,
      operator: m.operator,
      status: m.status === 'active' ? 'operational' : m.status === 'idle' ? 'idle' : 'maintenance',
      issue: m.issue
    }));
  },

  addEquipment: async (warehouseKey, data) => {
    const id = data.equipmentId || data.id || `EQP-${(await WarehouseEquipment.countDocuments(warehouseKeyMatch(warehouseKey)) + 1).toString().padStart(3, '0')}`;
    const doc = await WarehouseEquipment.create({
      id,
      name: data.name || 'New Equipment',
      type: data.type || 'forklift',
      status: data.status === 'idle' ? 'idle' : 'active',
      zone: data.zone,
      operator: data.operator,
      ...warehouseFieldsForCreate(warehouseKey),
    });
    return {
      id: doc.id,
      equipmentId: doc.id,
      name: doc.name,
      type: doc.type,
      zone: doc.zone,
      operator: doc.operator,
      status: doc.status === 'active' ? 'operational' : doc.status === 'idle' ? 'idle' : 'maintenance'
    };
  },

  getEquipmentById: async (warehouseKey, id) => {
    const equipment = await WarehouseEquipment.findOne(mergeWarehouseFilter({ id }, warehouseKey));
    if (!equipment) throw new ErrorResponse(`Equipment not found with id ${id}`, 404);
    return equipment;
  },

  reportIssue: async (warehouseKey, id, issueData) => {
    const equipment = await WarehouseEquipment.findOne(mergeWarehouseFilter({ id }, warehouseKey));
    if (!equipment) throw new ErrorResponse(`Equipment not found with id ${id}`, 404);
    
    equipment.status = 'maintenance';
    await equipment.save();

    const count = await EquipmentIssue.countDocuments(warehouseKeyMatch(warehouseKey));
    const issueId = `ISS-${(count + 1).toString().padStart(3, '0')}`;
    
    return await EquipmentIssue.create({
      id: issueId,
      equipmentId: id,
      reportedBy: issueData.reportedBy || 'System',
      description: issueData.description,
      severity: issueData.severity || 'medium',
      status: 'open',
      ...warehouseFieldsForCreate(warehouseKey),
    });
  },

  resolveIssue: async (warehouseKey, id) => {
    const equipment = await WarehouseEquipment.findOne(mergeWarehouseFilter({ id }, warehouseKey));
    if (!equipment) throw new ErrorResponse(`Equipment not found with id ${id}`, 404);
    
    equipment.status = 'active';
    await equipment.save();

    const issue = await EquipmentIssue.findOne(
      mergeWarehouseFilter({ equipmentId: id, status: { $ne: 'resolved' } }, warehouseKey)
    );
    if (issue) {
      issue.status = 'resolved';
      issue.resolvedAt = new Date();
      await issue.save();
    }
    
    return equipment;
  },

  exportEquipment: async (warehouseKey) => {
    const equipment = await WarehouseEquipment.find(warehouseKeyMatch(warehouseKey));
    const csv = `id,name,type,status,location\n${equipment.map(e => `${e.id},${e.name},${e.type},${e.status},${e.location || ''}`).join('\n')}`;
    return csv;
  }
};

module.exports = equipmentService;

