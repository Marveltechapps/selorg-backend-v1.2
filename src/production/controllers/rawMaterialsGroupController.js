const RawMaterial = require('../models/RawMaterial');
const InboundReceipt = require('../models/InboundReceipt');
const Requisition = require('../models/Requisition');
const { generateId } = require('../../utils/helpers');

/**
 * Raw Materials - Inventory
 */
const listMaterials = async (req, res) => {
  try {
    const search = req.query.search || '';
    const query = search ? { $or: [{ name: { $regex: search, $options: 'i' } }, { category: { $regex: search, $options: 'i' } }] } : {};
    const materials = await RawMaterial.find(query).sort({ name: 1 }).lean();
    res.status(200).json(materials.map((m) => ({
      id: m._id.toString(),
      name: m.name,
      currentStock: m.currentStock,
      unit: m.unit,
      safetyStock: m.safetyStock,
      reorderPoint: m.reorderPoint,
      supplier: m.supplier || '',
      category: m.category || '',
      lastOrderDate: m.lastOrderDate ? m.lastOrderDate.toISOString().split('T')[0] : undefined,
      orderStatus: m.orderStatus || 'none',
    })));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch materials' });
  }
};

const createMaterial = async (req, res) => {
  try {
    const { name, currentStock, unit, safetyStock, reorderPoint, supplier, category } = req.body || {};
    if (!name || currentStock === undefined || !unit) {
      return res.status(400).json({ success: false, error: 'name, currentStock, and unit are required' });
    }
    const doc = await RawMaterial.create({
      name,
      currentStock: Number(currentStock) || 0,
      unit: unit || 'kg',
      safetyStock: Number(safetyStock) || 0,
      reorderPoint: Number(reorderPoint) || 0,
      supplier: supplier || '',
      category: category || '',
    });
    res.status(201).json({
      id: doc._id.toString(),
      name: doc.name,
      currentStock: doc.currentStock,
      unit: doc.unit,
      safetyStock: doc.safetyStock,
      reorderPoint: doc.reorderPoint,
      supplier: doc.supplier,
      category: doc.category,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create material' });
  }
};

const orderMaterial = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body || {};
    const material = await RawMaterial.findById(id);
    if (!material) {
      return res.status(404).json({ success: false, error: 'Material not found' });
    }
    const qty = Number(quantity) || material.reorderPoint;
    material.orderStatus = 'ordered';
    material.lastOrderDate = new Date();
    await material.save();
    res.status(200).json({
      id: material._id.toString(),
      orderStatus: 'ordered',
      lastOrderDate: material.lastOrderDate.toISOString().split('T')[0],
      message: `Purchase order created for ${qty} ${material.unit} of ${material.name}`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to order material' });
  }
};

/**
 * Inbound Receipts
 */
const listReceipts = async (req, res) => {
  try {
    const receipts = await InboundReceipt.find({}).sort({ expectedDate: 1 }).lean();
    res.status(200).json(receipts.map((r) => ({
      id: r._id.toString(),
      poNumber: r.poNumber,
      supplier: r.supplier,
      expectedDate: r.expectedDate ? new Date(r.expectedDate).toISOString().split('T')[0] : '',
      status: r.status,
      items: r.items || '',
    })));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch receipts' });
  }
};

const markReceived = async (req, res) => {
  try {
    const { id } = req.params;
    const receipt = await InboundReceipt.findById(id);
    if (!receipt) {
      return res.status(404).json({ success: false, error: 'Receipt not found' });
    }
    receipt.status = 'received';
    await receipt.save();
    res.status(200).json({
      id: receipt._id.toString(),
      status: 'received',
      message: 'Shipment marked as received',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to mark received' });
  }
};

/**
 * Requisitions
 */
const listRequisitions = async (req, res) => {
  try {
    const requisitions = await Requisition.find({}).sort({ createdAt: -1 }).lean();
    res.status(200).json(requisitions.map((r) => ({
      id: r._id.toString(),
      reqNumber: r.reqNumber,
      material: r.material,
      quantity: r.quantity,
      requestedBy: r.requestedBy,
      line: r.line,
      status: r.status,
      date: r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : '',
    })));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch requisitions' });
  }
};

const createRequisition = async (req, res) => {
  try {
    const { material, quantity, line, requestedBy } = req.body || {};
    if (!material || !quantity || !line || !requestedBy) {
      return res.status(400).json({ success: false, error: 'material, quantity, line, and requestedBy are required' });
    }
    const reqNumber = `REQ-${Math.floor(1000 + Math.random() * 9000)}`;
    const doc = await Requisition.create({
      reqNumber,
      material,
      quantity: Number(quantity),
      line,
      requestedBy,
      status: 'pending',
    });
    res.status(201).json({
      id: doc._id.toString(),
      reqNumber: doc.reqNumber,
      material: doc.material,
      quantity: doc.quantity,
      line: doc.line,
      requestedBy: doc.requestedBy,
      status: 'pending',
      date: doc.createdAt ? new Date(doc.createdAt).toISOString().split('T')[0] : '',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create requisition' });
  }
};

const updateRequisitionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    const validStatuses = ['approved', 'rejected', 'issued'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'status must be approved, rejected, or issued' });
    }
    const reqDoc = await Requisition.findById(id);
    if (!reqDoc) {
      return res.status(404).json({ success: false, error: 'Requisition not found' });
    }
    reqDoc.status = status;
    await reqDoc.save();

    if (status === 'issued') {
      const mat = await RawMaterial.findOne({ name: { $regex: new RegExp(reqDoc.material, 'i') } });
      if (mat) {
        mat.currentStock = Math.max(0, mat.currentStock - reqDoc.quantity);
        await mat.save();
      }
    }

    res.status(200).json({
      id: reqDoc._id.toString(),
      status: reqDoc.status,
      message: `Requisition ${status}`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update requisition' });
  }
};

module.exports = {
  listMaterials,
  createMaterial,
  orderMaterial,
  listReceipts,
  markReceived,
  listRequisitions,
  createRequisition,
  updateRequisitionStatus,
};
