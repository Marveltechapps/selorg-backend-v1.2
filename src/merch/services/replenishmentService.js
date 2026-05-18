const ReplenishmentCycle = require('../models/ReplenishmentCycle');
const ReplenishmentOrder = require('../models/ReplenishmentOrder');
const InventoryTransaction = require('../models/InventoryTransaction');

class ReplenishmentService {
  
  static async createReplenishmentCycle(data) {
    try {
      const cycle = await ReplenishmentCycle.createCycle(data);
      
      return {
        success: true,
        cycle
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async analyzeInventoryNeeds(storeId, configData = {}) {
    try {
      // Get current stock for all SKUs at store
      const transactions = await InventoryTransaction.find({
        storeId,
        approvalStatus: 'approved'
      }).sort({ createdAt: -1 });

      // Calculate current stock per SKU
      const skuStock = {};
      transactions.forEach(txn => {
        if (!skuStock[txn.sku]) {
          skuStock[txn.sku] = 0;
        }
        skuStock[txn.sku] += txn.getImpactOnStock();
      });

      // Analyze needs (would integrate with product catalog and settings)
      const items = [];
      for (const [sku, stock] of Object.entries(skuStock)) {
        // Default thresholds (would come from product settings)
        const minStock = 10;
        const maxStock = 100;
        const reorderQty = 50;

        if (stock <= minStock) {
          items.push({
            sku,
            currentStock: Math.max(0, stock),
            minStock,
            maxStock,
            reorderQuantity: reorderQty,
            reason: stock === 0 ? 'stock_out' : 'stock_low'
          });
        }
      }

      return {
        success: true,
        itemsNeedingReplenishment: items,
        totalSKUsAnalyzed: Object.keys(skuStock).length,
        totalNeedingReplenishment: items.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async calculateReplenishmentQuantity(currentStock, minStock, maxStock, reorderQuantity, method = 'standard') {
    // Different methods: standard, min-max, EOQ (Economic Order Quantity)
    
    switch (method) {
      case 'min-max':
        // Order to bring stock to max
        return Math.max(0, maxStock - currentStock);
      
      case 'eoq':
        // Economic Order Quantity (simplified)
        // Would need demand rate and holding cost parameters
        return reorderQuantity;
      
      case 'standard':
      default:
        // Order when below min, bring to max
        if (currentStock <= minStock) {
          return Math.max(reorderQuantity, maxStock - currentStock);
        }
        return 0;
    }
  }

  static async createReplenishmentOrder(data) {
    try {
      const order = await ReplenishmentOrder.createOrder({
        ...data,
        orderStatus: 'draft'
      });

      return {
        success: true,
        order
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async submitOrderForApproval(orderId, submittedBy) {
    try {
      const order = await ReplenishmentOrder.findOne({ orderId });

      if (!order) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      order.submitForApproval();
      order.metadata.lastModifiedBy = submittedBy;
      await order.save();

      return {
        success: true,
        order
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async approveOrder(orderId, approvedBy, notes = '') {
    try {
      const order = await ReplenishmentOrder.findOne({ orderId });

      if (!order) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      order.approve(approvedBy, notes);
      await order.save();

      return {
        success: true,
        order
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async rejectOrder(orderId, reason) {
    try {
      const order = await ReplenishmentOrder.findOne({ orderId });

      if (!order) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      order.reject(reason);
      await order.save();

      return {
        success: true,
        order
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async receiveOrder(orderId, receivedQuantity, inspectionNotes = '') {
    try {
      const order = await ReplenishmentOrder.findOne({ orderId });

      if (!order) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      order.confirmReceipt(receivedQuantity, inspectionNotes);

      // Record transaction for received inventory
      const transaction = await InventoryTransaction.createTransaction({
        transactionType: 'purchase',
        sku: order.sku,
        quantity: receivedQuantity,
        storeId: order.storeId,
        createdBy: 'system',
        referenceId: orderId,
        referenceType: 'replenishment_order',
        priceInfo: {
          unitCost: order.pricing.unitCost,
          totalValue: receivedQuantity * order.pricing.unitCost
        }
      });

      if (!transaction.success) {
        return {
          success: false,
          error: 'Failed to record inventory transaction'
        };
      }

      await order.save();

      return {
        success: true,
        order,
        transaction: transaction.transaction
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async markOrderAsReceived(orderId) {
    try {
      const order = await ReplenishmentOrder.findOne({ orderId });

      if (!order) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      order.complete();
      await order.save();

      return {
        success: true,
        order
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async recordPayment(orderId, amount, invoiceNumber = '') {
    try {
      const order = await ReplenishmentOrder.findOne({ orderId });

      if (!order) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      order.markAsPaid(amount, invoiceNumber);
      await order.save();

      return {
        success: true,
        order
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async getOrdersByStatus(storeId, status) {
    try {
      const orders = await ReplenishmentOrder.getOrdersByStatus(storeId, status);

      return {
        success: true,
        count: orders.length,
        orders
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async getPendingApprovals(storeId) {
    try {
      const orders = await ReplenishmentOrder.getPendingApprovals(storeId);

      return {
        success: true,
        count: orders.length,
        orders
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async getPendingDeliveries(storeId) {
    try {
      const orders = await ReplenishmentOrder.getPendingDeliveries(storeId);

      return {
        success: true,
        count: orders.length,
        orders
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async getCycleHistory(storeId, days = 30) {
    try {
      const cycles = await ReplenishmentCycle.getCycleHistory(storeId, days);

      return {
        success: true,
        count: cycles.length,
        cycles
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = ReplenishmentService;
