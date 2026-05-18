const { DarkStore } = require('../models/DarkStore');
const { StoreInventory } = require('../models/StoreInventory');
const { getDeliveryRuntimeConfig } = require('../../platform/config/deliveryRuntimeConfig');

async function assignStore(req, res) {
  try {
    const { latitude, longitude } = req.body;
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'latitude and longitude are required' });
    }

    const { assignSearchMaxM } = await getDeliveryRuntimeConfig();

    const store = await DarkStore.findOne({
      isActive: true,
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [longitude, latitude] },
          $maxDistance: assignSearchMaxM,
        },
      },
    });

    if (!store) {
      return res.status(404).json({
        error: 'No serviceable store found near your location',
        serviceable: false,
      });
    }

    const distanceKm = getDistanceKm(latitude, longitude, store.location.coordinates[1], store.location.coordinates[0]);

    if (distanceKm > store.serviceRadius) {
      return res.status(404).json({
        error: 'Your location is outside our delivery area',
        serviceable: false,
        nearestStore: store.name,
        distanceKm: Math.round(distanceKm * 10) / 10,
      });
    }

    res.json({
      serviceable: true,
      store: {
        id: store._id,
        name: store.name,
        code: store.code,
        distanceKm: Math.round(distanceKm * 10) / 10,
        avgPickPackTime: store.avgPickPackTime,
        operatingHours: store.operatingHours,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign store' });
  }
}

async function getStoreInventory(req, res) {
  try {
    const { storeId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const inventory = await StoreInventory.find({ storeId, isAvailable: true, quantity: { $gt: 0 } })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('productId quantity');

    res.json({ inventory });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * ADMIN OPERATIONS - Dark Store Management
 */

/**
 * GET /admin/stores
 * List all dark stores with stats
 */
async function listStores(req, res) {
  try {
    const { page = 1, limit = 20, isActive } = req.query;
    const query = isActive !== undefined ? { isActive: isActive === 'true' } : {};

    const total = await DarkStore.countDocuments(query);
    const stores = await DarkStore.find(query)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('code name address location serviceRadius isActive avgPickPackTime createdAt updatedAt')
      .sort({ createdAt: -1 });

    // Get inventory stats for each store
    const storesWithStats = await Promise.all(
      stores.map(async (store) => {
        const stats = await StoreInventory.aggregate([
          { $match: { storeId: store._id } },
          {
            $group: {
              _id: null,
              totalSkus: { $sum: 1 },
              totalQty: { $sum: '$quantity' },
              availableSkus: { $sum: { $cond: ['$isAvailable', 1, 0] } },
            },
          },
        ]);

        return {
          id: store._id,
          code: store.code,
          name: store.name,
          address: store.address,
          location: {
            lat: store.location?.coordinates[1],
            lng: store.location?.coordinates[0],
          },
          serviceRadius: store.serviceRadius,
          isActive: store.isActive,
          avgPickPackTime: store.avgPickPackTime,
          inventory: stats[0] || { totalSkus: 0, totalQty: 0, availableSkus: 0 },
          createdAt: store.createdAt,
          updatedAt: store.updatedAt,
        };
      })
    );

    return res.json({
      success: true,
      data: storesWithStats,
      pagination: { page: Number(page), limit: Number(limit), total },
    });
  } catch (err) {
    console.error('listStores error:', err);
    return res.status(500).json({ success: false, error: 'Failed to list stores' });
  }
}

/**
 * POST /admin/stores
 * Create a new dark store
 */
async function createStore(req, res) {
  try {
    const { code, name, address, latitude, longitude, serviceRadius, avgPickPackTime, operatingHours } = req.body;

    if (!code || !name || !latitude || !longitude || !serviceRadius) {
      return res.status(400).json({
        success: false,
        error: 'code, name, latitude, longitude, and serviceRadius are required',
      });
    }

    // Check for duplicate code
    const existing = await DarkStore.findOne({ code });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Store with this code already exists' });
    }

    const store = new DarkStore({
      code,
      name,
      address: address || '',
      location: {
        type: 'Point',
        coordinates: [longitude, latitude],
      },
      serviceRadius: Number(serviceRadius),
      avgPickPackTime: Number(avgPickPackTime) || 5,
      operatingHours: operatingHours || {},
      isActive: true,
    });

    await store.save();

    return res.status(201).json({
      success: true,
      message: 'Store created successfully',
      data: { id: store._id, code: store.code, name: store.name },
    });
  } catch (err) {
    console.error('createStore error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create store' });
  }
}

/**
 * PUT /admin/stores/:id
 * Update dark store details
 */
async function updateStore(req, res) {
  try {
    const { id } = req.params;
    const { name, address, latitude, longitude, serviceRadius, avgPickPackTime, isActive, operatingHours } = req.body;

    const store = await DarkStore.findById(id);
    if (!store) {
      return res.status(404).json({ success: false, error: 'Store not found' });
    }

    if (name) store.name = name;
    if (address !== undefined) store.address = address;
    if (latitude && longitude) {
      store.location.coordinates = [longitude, latitude];
    }
    if (serviceRadius) store.serviceRadius = Number(serviceRadius);
    if (avgPickPackTime) store.avgPickPackTime = Number(avgPickPackTime);
    if (isActive !== undefined) store.isActive = isActive;
    if (operatingHours) store.operatingHours = operatingHours;

    await store.save();

    return res.json({
      success: true,
      message: 'Store updated successfully',
      data: { id: store._id, code: store.code, name: store.name },
    });
  } catch (err) {
    console.error('updateStore error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update store' });
  }
}

/**
 * DELETE /admin/stores/:id
 * Soft delete (deactivate) a store
 */
async function deleteStore(req, res) {
  try {
    const { id } = req.params;

    const store = await DarkStore.findByIdAndUpdate(id, { isActive: false }, { new: true });
    if (!store) {
      return res.status(404).json({ success: false, error: 'Store not found' });
    }

    return res.json({
      success: true,
      message: 'Store deactivated successfully',
      data: { id: store._id, code: store.code, isActive: store.isActive },
    });
  } catch (err) {
    console.error('deleteStore error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete store' });
  }
}

/**
 * PUT /admin/inventory/:storeId
 * Update store inventory quantities
 */
async function updateInventory(req, res) {
  try {
    const { storeId } = req.params;
    const { updates } = req.body; // [{ productId, quantity, isAvailable }]

    if (!Array.isArray(updates)) {
      return res.status(400).json({ success: false, error: 'updates must be an array' });
    }

    const results = await Promise.all(
      updates.map(({ productId, quantity, isAvailable }) =>
        StoreInventory.findOneAndUpdate(
          { storeId, productId },
          { quantity: Number(quantity), isAvailable: isAvailable !== false, lastUpdatedAt: new Date() },
          { new: true, upsert: true }
        )
      )
    );

    return res.json({
      success: true,
      message: `${results.length} inventory items updated`,
      data: { updated: results.length },
    });
  } catch (err) {
    console.error('updateInventory error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update inventory' });
  }
}

/**
 * POST /admin/inventory/:storeId/sync
 * Sync inventory from warehouse to store
 */
async function syncInventory(req, res) {
  try {
    const { storeId } = req.params;
    const { productAllocations } = req.body; // [{ productId, allocatedQty }]

    if (!Array.isArray(productAllocations)) {
      return res.status(400).json({ success: false, error: 'productAllocations must be an array' });
    }

    const results = await Promise.all(
      productAllocations.map(({ productId, allocatedQty }) =>
        StoreInventory.findOneAndUpdate(
          { storeId, productId },
          {
            quantity: Number(allocatedQty),
            isAvailable: allocatedQty > 0,
            lastSyncAt: new Date(),
          },
          { new: true, upsert: true }
        )
      )
    );

    return res.json({
      success: true,
      message: `Inventory synced for ${results.length} products`,
      data: { synced: results.length, storeId },
    });
  } catch (err) {
    console.error('syncInventory error:', err);
    return res.status(500).json({ success: false, error: 'Failed to sync inventory' });
  }
}

/**
 * GET /admin/inventory/:storeId/history
 * View inventory change history (audit log)
 */
async function getInventoryHistory(req, res) {
  try {
    const { storeId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // In production, would query from InventoryAuditLog collection
    // For now, return recent updates from StoreInventory
    const items = await StoreInventory.find({ storeId })
      .select('productId quantity isAvailable lastUpdatedAt lastSyncAt')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ lastUpdatedAt: -1 });

    return res.json({
      success: true,
      data: items,
      pagination: { page: Number(page), limit: Number(limit) },
    });
  } catch (err) {
    console.error('getInventoryHistory error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
}

/**
 * POST /admin/inventory/:storeId/replenish
 * Trigger replenishment order from warehouse
 */
async function triggerReplenishment(req, res) {
  try {
    const { storeId } = req.params;
    const { replenishmentItems } = req.body; // [{ productId, requestedQty }]

    if (!Array.isArray(replenishmentItems)) {
      return res.status(400).json({ success: false, error: 'replenishmentItems must be an array' });
    }

    // In production, this would create a ReplenishmentOrder and notify warehouse
    // For now, just log and return success
    console.log('Replenishment triggered for store:', storeId, 'Items:', replenishmentItems);

    return res.json({
      success: true,
      message: `Replenishment order created for ${replenishmentItems.length} items`,
      data: {
        storeId,
        itemsRequested: replenishmentItems.length,
        status: 'pending',
        createdAt: new Date(),
      },
    });
  } catch (err) {
    console.error('triggerReplenishment error:', err);
    return res.status(500).json({ success: false, error: 'Failed to trigger replenishment' });
  }
}

module.exports = {
  // Customer-facing
  assignStore,
  getStoreInventory,
  getDistanceKm,
  // Admin operations
  listStores,
  createStore,
  updateStore,
  deleteStore,
  updateInventory,
  syncInventory,
  getInventoryHistory,
  triggerReplenishment,
};
