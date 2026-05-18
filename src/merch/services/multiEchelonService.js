const MultiEchelonInventory = require('../models/MultiEchelonInventory');
const SKUMaster = require('../models/SKUMaster');
const { generateId } = require('../../utils/idGenerator');

class MultiEchelonService {
  static async aggregateInventoryAcrossEchelon(sku) {
    try {
      const echelons = await MultiEchelonInventory.find({ sku });
      
      if (echelons.length === 0) {
        throw new Error(`No inventory found for SKU: ${sku}`);
      }

      let totalSystemInventory = 0;
      const tierBreakdown = {};

      for (const echelon of echelons) {
        if (echelon.tierData && echelon.tierData.length > 0) {
          for (const tier of echelon.tierData) {
            totalSystemInventory += tier.available;
            if (!tierBreakdown[tier.tier]) {
              tierBreakdown[tier.tier] = 0;
            }
            tierBreakdown[tier.tier] += tier.available;
          }
        }
      }

      return {
        sku,
        totalSystemInventory,
        tierBreakdown,
        echelonCount: echelons.length,
      };
    } catch (error) {
      throw new Error(`Failed to aggregate inventory: ${error.message}`);
    }
  }

  static async calculateSystemInventory(sku) {
    try {
      const echelons = await MultiEchelonInventory.find({ sku });
      
      let onHand = 0;
      let reserved = 0;
      let available = 0;
      let inTransit = 0;

      for (const echelon of echelons) {
        if (echelon.tierData && echelon.tierData.length > 0) {
          for (const tier of echelon.tierData) {
            onHand += tier.onHand;
            reserved += tier.reserved;
            available += tier.available;
            inTransit += tier.inTransit;
          }
        }
      }

      return {
        sku,
        onHand,
        reserved,
        available,
        inTransit,
        totalInventory: onHand + reserved + inTransit,
      };
    } catch (error) {
      throw new Error(`Failed to calculate system inventory: ${error.message}`);
    }
  }

  static async getEchelonVisibility(sku) {
    try {
      const echelons = await MultiEchelonInventory.find({ sku });
      
      let totalRecords = 0;
      let visibleRecords = 0;

      for (const echelon of echelons) {
        if (echelon.tierData && echelon.tierData.length > 0) {
          totalRecords += echelon.tierData.length;
          for (const tier of echelon.tierData) {
            if (tier.available > 0 || tier.onHand > 0) {
              visibleRecords += 1;
            }
          }
        }
      }

      const visibilityScore = totalRecords > 0 ? (visibleRecords / totalRecords) * 100 : 0;

      return {
        sku,
        visibilityScore: Math.round(visibilityScore),
        totalRecords,
        visibleRecords,
      };
    } catch (error) {
      throw new Error(`Failed to get echelon visibility: ${error.message}`);
    }
  }

  static async synchronizeEchelonData() {
    try {
      const echelons = await MultiEchelonInventory.find({});
      
      for (const echelon of echelons) {
        let totalSystemInventory = 0;
        
        if (echelon.tierData && echelon.tierData.length > 0) {
          for (const tier of echelon.tierData) {
            totalSystemInventory += tier.available;
          }
        }

        echelon.supplyChainView.totalSystemInventory = totalSystemInventory;
        echelon.lastUpdated = new Date();
        await echelon.save();
      }

      return {
        synchronized: echelons.length,
        timestamp: new Date(),
      };
    } catch (error) {
      throw new Error(`Failed to synchronize echelon data: ${error.message}`);
    }
  }

  static async suggestEchelonRebalancing(sku) {
    try {
      const inventory = await this.calculateSystemInventory(sku);
      const echelons = await MultiEchelonInventory.find({ sku });

      const suggestions = [];

      // Analyze tier-level imbalances
      for (const echelon of echelons) {
        if (echelon.tierData && echelon.tierData.length > 0) {
          for (const tier of echelon.tierData) {
            if (tier.available === 0 && tier.reserved > 0) {
              suggestions.push({
                type: 'REBALANCE_NEEDED',
                tier: tier.tier,
                issue: 'No available inventory but has reservations',
                action: 'Transfer from higher tier',
                priority: 'HIGH',
              });
            }

            if (tier.inTransit > tier.onHand) {
              suggestions.push({
                type: 'TRANSIT_ALERT',
                tier: tier.tier,
                issue: 'In-transit inventory exceeds on-hand',
                action: 'Monitor incoming shipments',
                priority: 'MEDIUM',
              });
            }
          }
        }
      }

      return {
        sku,
        suggestions,
        totalSuggestions: suggestions.length,
      };
    } catch (error) {
      throw new Error(`Failed to suggest rebalancing: ${error.message}`);
    }
  }

  static async trackInventoryFlow(sku, sourceWarehouse, destinationWarehouse) {
    try {
      const flowRecords = [];

      // Track from source
      const sourceEchelon = await MultiEchelonInventory.findOne({
        sku,
        warehouseId: sourceWarehouse,
      });

      // Track to destination
      const destEchelon = await MultiEchelonInventory.findOne({
        sku,
        warehouseId: destinationWarehouse,
      });

      if (sourceEchelon) {
        flowRecords.push({
          location: 'Source',
          warehouse: sourceWarehouse,
          inventory: sourceEchelon.supplyChainView.totalSystemInventory,
        });
      }

      if (destEchelon) {
        flowRecords.push({
          location: 'Destination',
          warehouse: destinationWarehouse,
          inventory: destEchelon.supplyChainView.totalSystemInventory,
        });
      }

      return {
        sku,
        flowRecords,
        trackingDate: new Date(),
      };
    } catch (error) {
      throw new Error(`Failed to track inventory flow: ${error.message}`);
    }
  }

  static async createEchelonRecord(sku, warehouseId, tierData) {
    try {
      const echelonId = `ECH-${generateId()}`;
      
      let totalSystemInventory = 0;
      for (const tier of tierData) {
        totalSystemInventory += tier.available || 0;
      }

      const echelon = new MultiEchelonInventory({
        echelonId,
        sku,
        warehouseId,
        tierData,
        supplyChainView: {
          totalSystemInventory,
          visibilityScore: 75,
          riskLevel: 'MEDIUM',
        },
      });

      await echelon.save();
      return echelon;
    } catch (error) {
      throw new Error(`Failed to create echelon record: ${error.message}`);
    }
  }

  static async getAllEchelonInventory(sku) {
    try {
      return await MultiEchelonInventory.find({ sku });
    } catch (error) {
      throw new Error(`Failed to get all echelon inventory: ${error.message}`);
    }
  }
}

module.exports = MultiEchelonService;
