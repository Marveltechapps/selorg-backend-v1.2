const InventoryTransaction = require('../models/InventoryTransaction');
const InventoryReservation = require('../models/InventoryReservation');
const StockReconciliation = require('../models/StockReconciliation');
const mongoose = require('mongoose');

class InventoryService {
  // ==== INVENTORY TRANSACTIONS ====
  
  static async recordTransaction(data) {
    try {
      // Get current stock before transaction
      const existingStock = await this.getStoreStock(data.storeId, data.sku);
      data.balanceBeforeTransaction = existingStock;
      
      // Create transaction
      const transaction = await InventoryTransaction.createTransaction(data);
      
      // Calculate new balance
      const impact = transaction.getImpactOnStock();
      const newBalance = existingStock + impact;
      transaction.balanceAfterTransaction = newBalance;
      
      await transaction.save();
      
      return {
        success: true,
        transaction,
        newBalance
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async recordMultipleTransactions(transactions) {
    try {
      const results = [];
      
      for (let txnData of transactions) {
        const result = await this.recordTransaction(txnData);
        results.push(result);
        
        if (!result.success) {
          return {
            success: false,
            partialResults: results,
            failedAtIndex: results.length - 1,
            error: result.error
          };
        }
      }
      
      return {
        success: true,
        totalCreated: results.length,
        transactions: results
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async getTransactionHistory(storeId, sku, daysBack = 30) {
    try {
      const transactions = await InventoryTransaction.getStoreInventoryHistory(storeId, sku, daysBack);
      return {
        success: true,
        count: transactions.length,
        transactions
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async approveTransaction(transactionId, approvedBy) {
    try {
      const transaction = await InventoryTransaction.findOne({ transactionId });
      
      if (!transaction) {
        return {
          success: false,
          error: 'Transaction not found'
        };
      }
      
      if (!transaction.requiresApproval()) {
        return {
          success: false,
          error: 'This transaction does not require approval'
        };
      }
      
      transaction.approvalStatus = 'approved';
      transaction.approvedBy = approvedBy;
      await transaction.save();
      
      return {
        success: true,
        transaction
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ==== INVENTORY RESERVATIONS ====
  
  static async createReservation(data) {
    try {
      // Check if stock is available
      const available = await this.checkStockAvailability(data.storeId, data.items);
      
      if (!available.allAvailable) {
        return {
          success: false,
          error: 'Insufficient stock for reservation',
          unavailableItems: available.unavailableItems
        };
      }
      
      const reservation = await InventoryReservation.createReservation(data);
      
      return {
        success: true,
        reservation
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async checkStockAvailability(storeId, items) {
    try {
      const unavailableItems = [];
      let allAvailable = true;
      
      for (let item of items) {
        const stock = await this.getStoreStock(storeId, item.sku);
        
        if (stock < item.quantity) {
          unavailableItems.push({
            sku: item.sku,
            requested: item.quantity,
            available: stock,
            shortage: item.quantity - stock
          });
          allAvailable = false;
        }
      }
      
      return {
        allAvailable,
        unavailableItems
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async confirmReservation(reservationId) {
    try {
      const reservation = await InventoryReservation.findOne({ reservationId });
      
      if (!reservation) {
        return {
          success: false,
          error: 'Reservation not found'
        };
      }
      
      if (!reservation.confirmReservation()) {
        return {
          success: false,
          error: 'Reservation has expired'
        };
      }
      
      await reservation.save();
      
      return {
        success: true,
        reservation
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async cancelReservation(reservationId, reason) {
    try {
      const reservation = await InventoryReservation.findOne({ reservationId });
      
      if (!reservation) {
        return {
          success: false,
          error: 'Reservation not found'
        };
      }
      
      reservation.cancelReservation(reason);
      await reservation.save();
      
      return {
        success: true,
        reservation
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async expireReservations() {
    try {
      const expiredCount = await InventoryReservation.expireReservations();
      
      return {
        success: true,
        expiredCount
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ==== STOCK RECONCILIATION ====
  
  static async createReconciliation(data) {
    try {
      const reconciliation = await StockReconciliation.createReconciliation(data);
      return {
        success: true,
        reconciliation
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async submitCounts(reconciliationId, items) {
    try {
      const reconciliation = await StockReconciliation.findOne({ reconciliationId });
      
      if (!reconciliation) {
        return {
          success: false,
          error: 'Reconciliation not found'
        };
      }
      
      reconciliation.items.forEach(item => {
        const countedItem = items.find(i => i.sku === item.sku);
        if (countedItem) {
          item.countedQuantity = countedItem.quantity;
        }
      });
      
      reconciliation.calculateVariances();
      
      if (reconciliation.autoResolve) {
        reconciliation.resolveVariances();
      }
      
      await reconciliation.save();
      
      return {
        success: true,
        reconciliation
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async approveReconciliation(reconciliationId, approvedBy) {
    try {
      const reconciliation = await StockReconciliation.findOne({ reconciliationId });
      
      if (!reconciliation) {
        return {
          success: false,
          error: 'Reconciliation not found'
        };
      }
      
      if (!reconciliation.canApprove()) {
        return {
          success: false,
          error: 'Cannot approve reconciliation - unresolved variances exist'
        };
      }
      
      reconciliation.status = 'approved';
      reconciliation.approvedBy = approvedBy;
      reconciliation.approvedAt = new Date();
      
      await reconciliation.save();
      
      return {
        success: true,
        reconciliation
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ==== STOCK HELPER METHODS ====
  
  static async getStoreStock(storeId, sku) {
    try {
      // Get all transactions for this SKU at this store
      const transactions = await InventoryTransaction.find({
        storeId,
        sku,
        approvalStatus: 'approved'
      }).sort({ createdAt: -1 });
      
      let stock = 0;
      
      for (let txn of transactions) {
        stock += txn.getImpactOnStock();
      }
      
      return Math.max(0, stock);
    } catch (error) {
      return 0;
    }
  }

  static async getStoreStockReport(storeId) {
    try {
      // Get all unique SKUs at this store
      const uniqueSkus = await InventoryTransaction.distinct('sku', { storeId });
      
      const report = [];
      
      for (let sku of uniqueSkus) {
        const stock = await this.getStoreStock(storeId, sku);
        
        // Get latest transaction
        const latestTxn = await InventoryTransaction.findOne({
          storeId,
          sku,
          approvalStatus: 'approved'
        }).sort({ createdAt: -1 });
        
        report.push({
          sku,
          currentStock: stock,
          lastUpdated: latestTxn?.createdAt,
          lastTransactionType: latestTxn?.transactionType
        });
      }
      
      return {
        success: true,
        storeId,
        skuCount: report.length,
        items: report
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async getInventoryHealth(storeId) {
    try {
      const report = await this.getStoreStockReport(storeId);
      
      if (!report.success) {
        return report;
      }
      
      const totalValue = report.items.reduce((sum, item) => sum + item.currentStock, 0);
      const avgStock = totalValue / report.items.length;
      
      const transactions = await InventoryTransaction.find({ storeId });
      const transactionsByType = {};
      
      transactions.forEach(txn => {
        transactionsByType[txn.transactionType] = (transactionsByType[txn.transactionType] || 0) + 1;
      });
      
      return {
        success: true,
        storeId,
        health: {
          totalUniqueSkus: report.items.length,
          totalStockUnits: totalValue,
          averageStockPerSku: avgStock,
          transactionActivity: transactionsByType,
          lastUpdated: new Date()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = InventoryService;
