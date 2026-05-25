const Shelf = require('../models/Shelf');
const ShelfSKU = require('../models/ShelfSKU');
const { generateId } = require('../../utils/helpers');
const { parseLocationCode } = require('../services/inventoryBulkImport.service');

const DEFAULT_ZONE = 'Zone 1 (Ambient)';

function resolveStoreId(req) {
  return req.query.storeId || req.body?.storeId || process.env.DEFAULT_STORE_ID;
}

/**
 * GET /api/darkstore/inventory/shelves
 */
const listShelves = async (req, res) => {
  try {
    const storeId = resolveStoreId(req);
    const zone = req.query.zone || DEFAULT_ZONE;
    const shelves = await Shelf.find({ store_id: storeId, zone })
      .sort({ aisle: 1, shelf_number: 1 })
      .lean();

    res.status(200).json({
      success: true,
      store_id: storeId,
      zone,
      shelves,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to list shelves',
    });
  }
};

/**
 * POST /api/darkstore/inventory/shelves
 */
const createShelf = async (req, res) => {
  try {
    const storeId = resolveStoreId(req);
    const zone = req.body.zone || DEFAULT_ZONE;
    const locationInput = req.body.location_code || req.body.location;
    const parsed = parseLocationCode(locationInput);
    if (!parsed) {
      return res.status(400).json({ success: false, error: 'Valid location_code is required (e.g. A-01-01)' });
    }

    const existing = await Shelf.findOne({
      store_id: storeId,
      location_code: parsed.location_code,
    });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Shelf location already exists for this store' });
    }

    const shelf = await Shelf.create({
      shelf_id: generateId('SHF'),
      location_code: parsed.location_code,
      aisle: parsed.aisle,
      shelf_number: parsed.shelf_number,
      zone,
      section: req.body.section || `Aisle ${parsed.aisle}`,
      status: req.body.status || 'normal',
      is_critical: Boolean(req.body.is_critical),
      is_misplaced: Boolean(req.body.is_misplaced),
      store_id: storeId,
    });

    res.status(201).json({ success: true, shelf });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create shelf',
    });
  }
};

/**
 * PUT /api/darkstore/inventory/shelves/:shelfId
 */
const updateShelf = async (req, res) => {
  try {
    const { shelfId } = req.params;
    const shelf = await Shelf.findOne({ shelf_id: shelfId });
    if (!shelf) {
      return res.status(404).json({ success: false, error: 'Shelf not found' });
    }

    const updates = {};
    if (req.body.section !== undefined) updates.section = req.body.section;
    if (req.body.zone !== undefined) updates.zone = req.body.zone;
    if (req.body.status !== undefined) updates.status = req.body.status;
    if (req.body.is_critical !== undefined) updates.is_critical = Boolean(req.body.is_critical);
    if (req.body.is_misplaced !== undefined) updates.is_misplaced = Boolean(req.body.is_misplaced);

    if (req.body.location_code || req.body.location) {
      const parsed = parseLocationCode(req.body.location_code || req.body.location);
      if (!parsed) {
        return res.status(400).json({ success: false, error: 'Invalid location_code' });
      }
      const conflict = await Shelf.findOne({
        store_id: shelf.store_id,
        location_code: parsed.location_code,
        shelf_id: { $ne: shelfId },
      });
      if (conflict) {
        return res.status(409).json({ success: false, error: 'Another shelf already uses this location' });
      }
      updates.location_code = parsed.location_code;
      updates.aisle = parsed.aisle;
      updates.shelf_number = parsed.shelf_number;
    }

    const updated = await Shelf.findOneAndUpdate(
      { shelf_id: shelfId },
      { $set: updates },
      { new: true }
    ).lean();

    res.status(200).json({ success: true, shelf: updated });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update shelf',
    });
  }
};

/**
 * DELETE /api/darkstore/inventory/shelves/:shelfId
 */
const deleteShelf = async (req, res) => {
  try {
    const { shelfId } = req.params;
    const shelf = await Shelf.findOne({ shelf_id: shelfId });
    if (!shelf) {
      return res.status(404).json({ success: false, error: 'Shelf not found' });
    }

    await ShelfSKU.deleteMany({ shelf_id: shelfId });
    await Shelf.deleteOne({ shelf_id: shelfId });

    res.status(200).json({ success: true, message: 'Shelf deleted' });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete shelf',
    });
  }
};

module.exports = {
  listShelves,
  createShelf,
  updateShelf,
  deleteShelf,
};
