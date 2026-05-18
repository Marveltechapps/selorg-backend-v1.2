const AllocationRule = require('../models/AllocationRule');
const WarehouseAllocation = require('../models/WarehouseAllocation');
const InventoryTransaction = require('../models/InventoryTransaction');
const { generateId } = require('../../utils/idGenerator');

class AllocationService {
  static async createAllocationRule(data) {
    try {
      const ruleId = `RULE-${generateId()}`;
      const rule = new AllocationRule({
        ...data,
        ruleId,
      });
      await rule.save();
      return rule;
    } catch (error) {
      throw new Error(`Failed to create allocation rule: ${error.message}`);
    }
  }

  static async getAllocationRule(ruleId) {
    try {
      return await AllocationRule.findOne({ ruleId });
    } catch (error) {
      throw new Error(`Failed to get allocation rule: ${error.message}`);
    }
  }

  static async getApplicableRules(sku, sourceWarehouse) {
    try {
      const rules = await AllocationRule.find({
        isActive: true,
        applicableProducts: { $in: [sku, '*'] },
      }).sort({ priority: 1 });

      return rules;
    } catch (error) {
      throw new Error(`Failed to get applicable rules: ${error.message}`);
    }
  }

  static async optimizeAllocation(demand, availableInventory) {
    try {
      // Allocation optimization logic
      const allocation = {};

      // Simple FIFO-like optimization: allocate in order of priority
      for (const [warehouseId, demandQty] of Object.entries(demand)) {
        let remaining = demandQty;

        for (const [sourceId, availableQty] of Object.entries(availableInventory)) {
          if (remaining <= 0) break;

          const toAllocate = Math.min(remaining, availableQty);
          if (!allocation[sourceId]) allocation[sourceId] = {};
          allocation[sourceId][warehouseId] = toAllocate;
          remaining -= toAllocate;
        }
      }

      return allocation;
    } catch (error) {
      throw new Error(`Failed to optimize allocation: ${error.message}`);
    }
  }

  static async proposeAllocation(data) {
    try {
      const allocationId = `ALLOC-${generateId()}`;
      const totalAllocated = data.allocations.reduce((sum, a) => sum + a.allocatedQuantity, 0);
      const totalValue = totalAllocated * (data.unitPrice || 0);

      const allocation = new WarehouseAllocation({
        ...data,
        allocationId,
        totalAllocated,
        totalValue,
        status: 'PROPOSED',
      });
      await allocation.save();
      return allocation;
    } catch (error) {
      throw new Error(`Failed to propose allocation: ${error.message}`);
    }
  }

  static async approveAllocation(allocationId, approver, comments = '') {
    try {
      const allocation = await WarehouseAllocation.findOneAndUpdate(
        { allocationId },
        {
          status: 'APPROVED',
          $push: {
            approvals: {
              approver,
              approvalDate: new Date(),
              comments,
            },
          },
          updatedAt: new Date(),
        },
        { new: true },
      );
      return allocation;
    } catch (error) {
      throw new Error(`Failed to approve allocation: ${error.message}`);
    }
  }

  static async fulfillAllocation(allocationId) {
    try {
      const allocation = await WarehouseAllocation.findOne({ allocationId });
      if (!allocation) throw new Error('Allocation not found');

      // Create transfer orders for each allocation
      const transfers = [];
      for (const alloc of allocation.allocations) {
        const transfer = {
          sourceWarehouse: allocation.sourceWarehouse,
          destinationWarehouse: alloc.destinationWarehouse,
          items: [{
            sku: alloc.sku,
            quantityRequested: alloc.allocatedQuantity,
          }],
        };
        transfers.push(transfer);
      }

      // Update allocation status
      await WarehouseAllocation.findOneAndUpdate(
        { allocationId },
        { status: 'FULFILLED', updatedAt: new Date() },
      );

      return {
        allocation,
        transferOrders: transfers,
      };
    } catch (error) {
      throw new Error(`Failed to fulfill allocation: ${error.message}`);
    }
  }

  static async calculateAllocationMetrics() {
    try {
      const allocations = await WarehouseAllocation.find({});
      const totalAllocations = allocations.length;
      const approvedAllocations = allocations.filter(a => a.status === 'APPROVED').length;
      const fulfillmentRate = totalAllocations > 0 ? (approvedAllocations / totalAllocations) * 100 : 0;
      const totalValue = allocations.reduce((sum, a) => sum + a.totalValue, 0);

      return {
        totalAllocations,
        approvedAllocations,
        fulfillmentRate: Math.round(fulfillmentRate),
        totalValue,
        averageAllocationValue: totalAllocations > 0 ? totalValue / totalAllocations : 0,
      };
    } catch (error) {
      throw new Error(`Failed to calculate allocation metrics: ${error.message}`);
    }
  }

  static async updateAllocationRule(ruleId, updates) {
    try {
      const rule = await AllocationRule.findOneAndUpdate(
        { ruleId },
        { ...updates, updatedAt: new Date() },
        { new: true },
      );
      return rule;
    } catch (error) {
      throw new Error(`Failed to update allocation rule: ${error.message}`);
    }
  }

  static async getAllAllocationRules() {
    try {
      return await AllocationRule.find({ isActive: true }).sort({ priority: 1 });
    } catch (error) {
      throw new Error(`Failed to get all allocation rules: ${error.message}`);
    }
  }
}

module.exports = AllocationService;
