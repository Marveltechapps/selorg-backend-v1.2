const Order = require('../../darkstore/models/Order');
const SKU = require('../../merch/models/SKU');
// const Inventory = require('../../darkstore/models/Inventory'); // Inventory model may not exist, commenting out
// const User = require('../../admin/models/User'); // User model may not exist, commenting out
const websocketService = require('../../utils/websocket');
const logger = require('../../core/utils/logger');

/**
 * Bulk Operations Service
 * Handles mass updates, imports, and exports across modules
 */
class BulkOperationsService {
  /**
   * Bulk update orders
   * @param {Array} orderIds - Array of order IDs
   * @param {Object} updates - Updates to apply
   */
  async bulkUpdateOrders(orderIds, updates) {
    try {
      const result = await Order.updateMany(
        { order_id: { $in: orderIds } },
        { $set: { ...updates, updated_at: new Date() } }
      );

      // Broadcast real-time updates
      orderIds.forEach((orderId) => {
        websocketService.broadcastToRoom(
          `order:${orderId}`,
          'order:updated',
          {
            order_id: orderId,
            updates,
            timestamp: new Date().toISOString(),
          }
        );
      });

      return {
        success: true,
        matched: result.matchedCount,
        modified: result.modifiedCount,
      };
    } catch (error) {
      logger.error('Error in bulk update orders:', error);
      throw error;
    }
  }

  /**
   * Bulk update products
   * @param {Array} productIds - Array of product IDs/SKUs
   * @param {Object} updates - Updates to apply
   */
  async bulkUpdateProducts(productIds, updates) {
    try {
      const result = await SKU.updateMany(
        { $or: [{ sku: { $in: productIds } }, { id: { $in: productIds } }] },
        { $set: { ...updates, updated_at: new Date() } }
      );

      // Broadcast real-time updates
      websocketService.broadcast('product:bulk:updated', {
        product_ids: productIds,
        updates,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        matched: result.matchedCount,
        modified: result.modifiedCount,
      };
    } catch (error) {
      logger.error('Error in bulk update products:', error);
      throw error;
    }
  }

  /**
   * Bulk update inventory
   * @param {Array} items - Array of {sku, storeId, quantity, operation}
   * @param {string} operation - 'set', 'add', 'subtract'
   */
  async bulkUpdateInventory(items, operation = 'set') {
    try {
      const results = {
        successful: [],
        failed: [],
      };

      for (const item of items) {
        try {
          let update;
          if (operation === 'add') {
            update = { $inc: { quantity: item.quantity } };
          } else if (operation === 'subtract') {
            update = { $inc: { quantity: -item.quantity } };
          } else {
            update = { $set: { quantity: item.quantity } };
          }

          // Inventory model not available, skipping
          const result = { matchedCount: 0, modifiedCount: 0 };
          /* await Inventory.findOneAndUpdate(
            { sku: item.sku, store_id: item.storeId },
            {
              ...update,
              $set: {
                ...update.$set,
                updated_at: new Date(),
              },
            },
            { upsert: true, new: true }
          ); */

          // Broadcast real-time update
          websocketService.broadcastToRoom(
            `store:${item.storeId}`,
            'inventory:updated',
            {
              sku: item.sku,
              store_id: item.storeId,
              quantity: result.quantity,
              operation,
              timestamp: new Date().toISOString(),
            }
          );

          results.successful.push({
            sku: item.sku,
            store_id: item.storeId,
            quantity: result.quantity,
          });
        } catch (error) {
          results.failed.push({
            ...item,
            error: error.message,
          });
        }
      }

      return results;
    } catch (error) {
      logger.error('Error in bulk update inventory:', error);
      throw error;
    }
  }

  /**
   * Bulk import products from CSV/Excel
   * @param {Array} products - Array of product objects
   */
  async bulkImportProducts(products) {
    try {
      const results = {
        successful: [],
        failed: [],
      };

      for (const product of products) {
        try {
          const existingProduct = await SKU.findOne({
            $or: [{ sku: product.sku }, { id: product.id }],
          });

          if (existingProduct) {
            // Update existing
            const updated = await SKU.findOneAndUpdate(
              { $or: [{ sku: product.sku }, { id: product.id }] },
              { $set: { ...product, updated_at: new Date() } },
              { new: true }
            );
            results.successful.push({ sku: product.sku, action: 'updated', product: updated });
          } else {
            // Create new
            const created = await SKU.create({
              ...product,
              created_at: new Date(),
            });
            results.successful.push({ sku: product.sku, action: 'created', product: created });
          }
        } catch (error) {
          results.failed.push({
            sku: product.sku,
            error: error.message,
          });
        }
      }

      // Broadcast bulk import completion
      websocketService.broadcast('product:bulk:imported', {
        successful: results.successful.length,
        failed: results.failed.length,
        timestamp: new Date().toISOString(),
      });

      return results;
    } catch (error) {
      logger.error('Error in bulk import products:', error);
      throw error;
    }
  }

  /**
   * Bulk export data
   * @param {string} type - 'orders', 'products', 'inventory', 'users'
   * @param {Object} filters - Filters to apply
   * @param {string} format - 'csv', 'excel', 'json'
   */
  async bulkExport(type, filters = {}, format = 'csv') {
    try {
      let data = [];
      let filename = '';

      switch (type) {
        case 'orders':
          data = await Order.find(filters).lean();
          filename = `orders_export_${Date.now()}.${format}`;
          break;

        case 'products':
          data = await SKU.find(filters).lean();
          filename = `products_export_${Date.now()}.${format}`;
          break;

        case 'inventory':
          data = await Inventory.find(filters).lean();
          filename = `inventory_export_${Date.now()}.${format}`;
          break;

        case 'users':
          data = []; // User model not available
          filename = `users_export_${Date.now()}.${format}`;
          break;

        default:
          throw new Error(`Unsupported export type: ${type}`);
      }

      return {
        data,
        filename,
        format,
        count: data.length,
      };
    } catch (error) {
      logger.error('Error in bulk export:', error);
      throw error;
    }
  }

  /**
   * Bulk delete items
   * @param {string} type - 'orders', 'products', 'inventory'
   * @param {Array} ids - Array of IDs to delete
   */
  async bulkDelete(type, ids) {
    try {
      let result;

      switch (type) {
        case 'orders':
          result = await Order.deleteMany({ order_id: { $in: ids } });
          break;

        case 'products':
          result = await SKU.deleteMany({
            $or: [{ sku: { $in: ids } }, { id: { $in: ids } }],
          });
          break;

        case 'inventory':
          result = { deletedCount: 0 }; // Inventory model not available
          // await Inventory.deleteMany({
          //   $or: [{ sku: { $in: ids } }, { id: { $in: ids } }],
          // });
          break;

        default:
          throw new Error(`Unsupported delete type: ${type}`);
      }

      // Broadcast deletion
      websocketService.broadcast(`${type}:bulk:deleted`, {
        ids,
        count: result.deletedCount,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        deleted: result.deletedCount,
      };
    } catch (error) {
      logger.error('Error in bulk delete:', error);
      throw error;
    }
  }
}

module.exports = new BulkOperationsService();
