// const Inventory = require('../../darkstore/models/Inventory'); // Inventory model may not exist, using InventoryItem instead
const InventoryItem = require('../../warehouse/models/InventoryItem');
const websocketService = require('../../utils/websocket');
const logger = require('../../core/utils/logger');

/**
 * Real-time Inventory Sync Service
 * Syncs inventory between Darkstore and Warehouse modules
 */
class InventorySyncService {
  /**
   * Sync inventory from warehouse to darkstore
   * @param {string} sku - SKU to sync
   * @param {string} warehouseId - Warehouse ID
   * @param {string} storeId - Store ID
   * @param {number} quantity - Quantity to sync
   */
  async syncWarehouseToStore(sku, warehouseId, storeId, quantity) {
    try {
      // Get warehouse inventory
      const warehouseItem = await InventoryItem.findOne({
        sku,
        warehouse_id: warehouseId,
      }).lean();

      if (!warehouseItem) {
        throw new Error(`SKU ${sku} not found in warehouse ${warehouseId}`);
      }

      // Update or create darkstore inventory
      const storeItem = await InventoryItem.findOneAndUpdate(
        {
          sku,
          store_id: storeId,
        },
        {
          $set: {
            sku,
            store_id: storeId,
            product_name: warehouseItem.product_name,
            quantity: quantity || warehouseItem.quantity,
            location: warehouseItem.location,
            last_synced_at: new Date(),
            synced_from: 'warehouse',
            warehouse_id: warehouseId,
          },
        },
        { upsert: true, new: true }
      );

      // Broadcast real-time update
      websocketService.broadcastToRoom(
        `store:${storeId}`,
        'inventory:synced',
        {
          sku,
          store_id: storeId,
          warehouse_id: warehouseId,
          quantity: storeItem.quantity,
          timestamp: new Date().toISOString(),
        }
      );

      return {
        success: true,
        sku,
        store_id: storeId,
        warehouse_id: warehouseId,
        quantity: storeItem.quantity,
      };
    } catch (error) {
      logger.error('Error syncing warehouse to store:', error);
      throw error;
    }
  }

  /**
   * Sync inventory from darkstore to warehouse
   * @param {string} sku - SKU to sync
   * @param {string} storeId - Store ID
   * @param {string} warehouseId - Warehouse ID
   */
  async syncStoreToWarehouse(sku, storeId, warehouseId) {
    try {
      // Get store inventory
      const storeItem = await InventoryItem.findOne({
        sku,
        store_id: storeId,
      }).lean();

      if (!storeItem) {
        throw new Error(`SKU ${sku} not found in store ${storeId}`);
      }

      // Update warehouse inventory (add to existing)
      const warehouseItem = await InventoryItem.findOneAndUpdate(
        {
          sku,
          warehouse_id: warehouseId,
        },
        {
          $inc: { quantity: storeItem.quantity },
          $set: {
            last_synced_at: new Date(),
            synced_from: 'store',
            store_id: storeId,
          },
        },
        { upsert: true, new: true }
      );

      // Broadcast real-time update
      websocketService.broadcastToRoom(
        `warehouse:${warehouseId}`,
        'inventory:synced',
        {
          sku,
          warehouse_id: warehouseId,
          store_id: storeId,
          quantity: warehouseItem.quantity,
          timestamp: new Date().toISOString(),
        }
      );

      return {
        success: true,
        sku,
        warehouse_id: warehouseId,
        store_id: storeId,
        quantity: warehouseItem.quantity,
      };
    } catch (error) {
      logger.error('Error syncing store to warehouse:', error);
      throw error;
    }
  }

  /**
   * Bulk sync inventory
   * @param {Array} items - Array of {sku, warehouseId, storeId, quantity}
   */
  async bulkSync(items) {
    const results = {
      successful: [],
      failed: [],
    };

    for (const item of items) {
      try {
        const result = await this.syncWarehouseToStore(
          item.sku,
          item.warehouseId,
          item.storeId,
          item.quantity
        );
        results.successful.push(result);
      } catch (error) {
        results.failed.push({
          ...item,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Get sync status for a SKU
   * @param {string} sku - SKU to check
   * @param {string} storeId - Store ID
   * @param {string} warehouseId - Warehouse ID
   */
  async getSyncStatus(sku, storeId, warehouseId) {
    try {
      const [storeItem, warehouseItem] = await Promise.all([
        InventoryItem.findOne({ sku, store_id: storeId }).lean(),
        InventoryItem.findOne({ sku, warehouse_id: warehouseId }).lean(),
      ]);

      return {
        sku,
        store: {
          exists: !!storeItem,
          quantity: storeItem?.quantity || 0,
          last_synced: storeItem?.last_synced_at,
        },
        warehouse: {
          exists: !!warehouseItem,
          quantity: warehouseItem?.quantity || 0,
          last_synced: warehouseItem?.last_synced_at,
        },
        in_sync: storeItem?.quantity === warehouseItem?.quantity,
      };
    } catch (error) {
      logger.error('Error getting sync status:', error);
      throw error;
    }
  }
}

module.exports = new InventorySyncService();
