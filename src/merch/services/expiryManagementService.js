const ExpiryBatch = require('../models/ExpiryBatch');
const InventoryTransaction = require('../models/InventoryTransaction');

class ExpiryManagementService {
  
  static async createBatch(data) {
    try {
      const batch = await ExpiryBatch.createBatch(data);

      return {
        success: true,
        batch
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async checkBatchExpiry(batchId) {
    try {
      const batch = await ExpiryBatch.findOne({ batchId });

      if (!batch) {
        return {
          success: false,
          error: 'Batch not found'
        };
      }

      const daysToExpiry = batch.checkExpiryStatus();
      await batch.save();

      return {
        success: true,
        batch,
        daysToExpiry,
        isExpired: batch.expiryStatus.isExpired
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async checkStoreExpiringBatches(storeId, daysThreshold = 30) {
    try {
      const batches = await ExpiryBatch.getExpiringBatches(storeId, daysThreshold);

      // Update expiry status for all
      for (let batch of batches) {
        batch.checkExpiryStatus();
        await batch.save();
      }

      const expiring30 = batches.filter(b => b.expiryStatus.daysUntilExpiry <= 30).length;
      const expiring7 = batches.filter(b => b.expiryStatus.daysUntilExpiry <= 7).length;

      return {
        success: true,
        totalExpiringBatches: batches.length,
        expiring30days: expiring30,
        expiring7days: expiring7,
        batches
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async sendExpiryAlerts(storeId, thresholdDays = [30, 14, 7]) {
    try {
      const batches = await ExpiryBatch.getExpiringBatches(storeId, 30);
      const alertsSent = [];

      for (let batch of batches) {
        for (let days of thresholdDays) {
          const alerted = batch.sendExpiryAlert(days);
          if (alerted) {
            alertsSent.push({
              batchId: batch.batchId,
              threshold: days,
              expiryDate: batch.expiryDate
            });
          }
        }
        await batch.save();
      }

      return {
        success: true,
        totalAlertsSent: alertsSent.length,
        alerts: alertsSent
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async markBatchForRemoval(batchId, approvedBy, notes = '') {
    try {
      const batch = await ExpiryBatch.findOne({ batchId });

      if (!batch) {
        return {
          success: false,
          error: 'Batch not found'
        };
      }

      batch.markForRemoval(approvedBy, notes);
      await batch.save();

      return {
        success: true,
        batch
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async recordBatchRemoval(batchId, quantityRemoved, notes = '') {
    try {
      const batch = await ExpiryBatch.findOne({ batchId });

      if (!batch) {
        return {
          success: false,
          error: 'Batch not found'
        };
      }

      batch.recordRemoval(quantityRemoved, notes);

      // Record transaction for removed inventory
      const transaction = await InventoryTransaction.createTransaction({
        transactionType: 'expiry_removal',
        sku: batch.sku,
        quantity: quantityRemoved || batch.quantity,
        storeId: batch.storeId,
        createdBy: 'system',
        referenceId: batchId,
        referenceType: 'expiry_batch',
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        reason: `Batch expired on ${batch.expiryDate.toLocaleDateString()}`
      });

      if (!transaction.success) {
        return {
          success: false,
          error: 'Failed to record transaction'
        };
      }

      await batch.save();

      return {
        success: true,
        batch,
        transaction: transaction.transaction,
        wasteAmount: batch.removal.wasteAmount
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async recordBatchSale(batchId, quantitySold, discountPercent = 0) {
    try {
      const batch = await ExpiryBatch.findOne({ batchId });

      if (!batch) {
        return {
          success: false,
          error: 'Batch not found'
        };
      }

      batch.recordSale(quantitySold, discountPercent);

      // Record transaction for sales
      const transaction = await InventoryTransaction.createTransaction({
        transactionType: 'sale',
        sku: batch.sku,
        quantity: quantitySold,
        storeId: batch.storeId,
        createdBy: 'system',
        referenceId: batchId,
        referenceType: 'expiry_batch_sale',
        batchNumber: batch.batchNumber,
        notes: `Expiring batch sale - discount ${discountPercent}%`
      });

      if (!transaction.success) {
        return {
          success: false,
          error: 'Failed to record transaction'
        };
      }

      await batch.save();

      return {
        success: true,
        batch,
        transaction: transaction.transaction
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async getExpiredBatches(storeId) {
    try {
      const batches = await ExpiryBatch.getExpiredBatches(storeId);

      return {
        success: true,
        count: batches.length,
        batches
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async calculateWastageReport(storeId, startDate, endDate) {
    try {
      const wasteReport = await ExpiryBatch.getTotalWaste(storeId, startDate, endDate);

      return {
        success: true,
        report: wasteReport[0] || {
          totalWaste: 0,
          batchesRemoved: 0,
          itemsRemoved: 0
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async getStorageConditionReport(storeId) {
    try {
      const batches = await ExpiryBatch.find({ storeId });

      const conditionReport = {};
      batches.forEach(batch => {
        const condition = batch.metadata.storageCondition || 'unknown';
        if (!conditionReport[condition]) {
          conditionReport[condition] = [];
        }
        conditionReport[condition].push({
          batchId: batch.batchId,
          sku: batch.sku,
          temperature: batch.metadata.temperature,
          humidity: batch.metadata.humidity
        });
      });

      return {
        success: true,
        report: conditionReport
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async getExpiryStatistics(storeId, days = 30) {
    try {
      const batches = await ExpiryBatch.getExpiringBatches(storeId, days);
      
      const stats = {
        totalBatches: batches.length,
        expiringIn7Days: 0,
        expiringIn14Days: 0,
        expiringIn30Days: 0,
        totalUnitsAtRisk: 0,
        totalWasteRisk: 0,
        bySku: {}
      };

      batches.forEach(batch => {
        const daysToExpiry = batch.expiryStatus.daysUntilExpiry;

        if (daysToExpiry <= 7) {
          stats.expiringIn7Days++;
        } else if (daysToExpiry <= 14) {
          stats.expiringIn14Days++;
        } else if (daysToExpiry <= 30) {
          stats.expiringIn30Days++;
        }

        stats.totalUnitsAtRisk += batch.quantity;
        stats.totalWasteRisk += batch.cost || 0;

        if (!stats.bySku[batch.sku]) {
          stats.bySku[batch.sku] = {
            batches: 0,
            units: 0,
            value: 0
          };
        }

        stats.bySku[batch.sku].batches++;
        stats.bySku[batch.sku].units += batch.quantity;
        stats.bySku[batch.sku].value += batch.cost || 0;
      });

      return {
        success: true,
        statistics: stats
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = ExpiryManagementService;
