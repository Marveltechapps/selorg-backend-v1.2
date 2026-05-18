const AllocationService = require('../services/allocationService');
const WarehouseAllocation = require('../models/WarehouseAllocation');
const { apiResponse } = require('../../utils/apiResponse');

class AllocationController {
  static async createAllocationRule(req, res) {
    try {
      const rule = await AllocationService.createAllocationRule(req.body);
      res.status(201).json(apiResponse.success(rule, 'Allocation rule created successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getAllocationRule(req, res) {
    try {
      const { ruleId } = req.params;
      const rule = await AllocationService.getAllocationRule(ruleId);
      
      if (!rule) {
        return res.status(404).json(apiResponse.error('Allocation rule not found', 404));
      }

      res.status(200).json(apiResponse.success(rule, 'Allocation rule retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getApplicableRules(req, res) {
    try {
      const { sku, sourceWarehouse } = req.query;
      const rules = await AllocationService.getApplicableRules(sku, sourceWarehouse);
      res.status(200).json(apiResponse.success(rules, 'Applicable rules retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async proposeAllocation(req, res) {
    try {
      const allocation = await AllocationService.proposeAllocation(req.body);
      res.status(201).json(apiResponse.success(allocation, 'Allocation proposed successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async approveAllocation(req, res) {
    try {
      const { allocationId } = req.params;
      const { approver, comments } = req.body;
      const allocation = await AllocationService.approveAllocation(allocationId, approver, comments);
      res.status(200).json(apiResponse.success(allocation, 'Allocation approved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async fulfillAllocation(req, res) {
    try {
      const { allocationId } = req.params;
      const result = await AllocationService.fulfillAllocation(allocationId);
      res.status(200).json(apiResponse.success(result, 'Allocation fulfilled successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async calculateAllocationMetrics(req, res) {
    try {
      const metrics = await AllocationService.calculateAllocationMetrics();
      res.status(200).json(apiResponse.success(metrics, 'Allocation metrics calculated successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async updateAllocationRule(req, res) {
    try {
      const { ruleId } = req.params;
      const rule = await AllocationService.updateAllocationRule(ruleId, req.body);
      
      if (!rule) {
        return res.status(404).json(apiResponse.error('Allocation rule not found', 404));
      }

      res.status(200).json(apiResponse.success(rule, 'Allocation rule updated successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getAllAllocationRules(req, res) {
    try {
      const rules = await AllocationService.getAllAllocationRules();
      res.status(200).json(apiResponse.success(rules, 'All allocation rules retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  /** GET /allocation — list recent warehouse allocations */
  static async getAllocations(req, res) {
    try {
      const list = await WarehouseAllocation.find({})
        .sort({ allocationDate: -1 })
        .limit(100)
        .lean();
      res.status(200).json(apiResponse.success(list, 'Allocations retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  /** GET /allocation/sku/:skuId/history */
  static async getAllocationHistory(req, res) {
    try {
      const { skuId } = req.params;
      const docs = await WarehouseAllocation.find({ 'allocations.sku': skuId })
        .sort({ allocationDate: -1 })
        .limit(50)
        .lean();
      res.status(200).json(apiResponse.success(docs, 'Allocation history retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  /** PUT /allocation/:id — update allocation rule by ruleId */
  static async updateAllocation(req, res) {
    try {
      const { id } = req.params;
      const rule = await AllocationService.updateAllocationRule(id, req.body);
      if (!rule) {
        return res.status(404).json(apiResponse.error('Allocation rule not found', 404));
      }
      res.status(200).json(apiResponse.success(rule, 'Allocation updated successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getAlerts(req, res) {
    res.status(200).json(apiResponse.success([], 'No allocation alerts configured'));
  }

  static async createAlert(req, res) {
    res.status(501).json(apiResponse.error('Allocation alerts are not implemented', 501));
  }

  static async updateAlertStatus(req, res) {
    res.status(501).json(apiResponse.error('Allocation alerts are not implemented', 501));
  }

  static async rebalanceAllocations(req, res) {
    try {
      const metrics = await AllocationService.calculateAllocationMetrics();
      res.status(200).json(apiResponse.success(metrics, 'Rebalance metrics computed'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async autoRebalance(req, res) {
    return AllocationController.rebalanceAllocations(req, res);
  }

  static async seedAllocationData(req, res) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json(apiResponse.error('Seed is disabled in production', 403));
    }
    res.status(501).json(apiResponse.error('Seed not implemented', 501));
  }

  static async createTransferOrder(req, res) {
    const TransferOrderController = require('./transferOrderController');
    return TransferOrderController.createTransferOrder(req, res);
  }
}

module.exports = AllocationController;
