const AllocationService = require('../services/allocationService');
const SkuAllocationService = require('../services/skuAllocationService');
const AllocationAlert = require('../models/AllocationAlert');
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

  /** GET /allocation — SKU × location allocations */
  static async getAllocations(req, res) {
    try {
      const list = await SkuAllocationService.listAllocations();
      res.status(200).json(apiResponse.success(list, 'Allocations retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  /** GET /allocation/sku/:skuId/history */
  static async getAllocationHistory(req, res) {
    try {
      const { skuId } = req.params;
      const history = await SkuAllocationService.getAllocationHistory(skuId);
      res.status(200).json(apiResponse.success(history, 'Allocation history retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  /** PUT /allocation/:id — update SKU location allocation */
  static async updateAllocation(req, res) {
    try {
      const { id } = req.params;
      const updated = await SkuAllocationService.updateAllocation(id, req.body);
      if (!updated) {
        return res.status(404).json(apiResponse.error('Allocation not found', 404));
      }
      res.status(200).json(apiResponse.success(updated, 'Allocation updated successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getAlerts(req, res) {
    try {
      await SkuAllocationService.syncAlertsFromAllocations();
      const alerts = await SkuAllocationService.listAlerts();
      res.status(200).json(apiResponse.success(alerts, 'Allocation alerts retrieved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async createAlert(req, res) {
    try {
      const alert = await AllocationAlert.create(req.body);
      res.status(201).json(apiResponse.success(alert, 'Alert created'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async updateAlertStatus(req, res) {
    try {
      const { id } = req.params;
      const status = req.body?.status ?? 'dismissed';
      if (status === 'dismissed') {
        const alert = await SkuAllocationService.dismissAlert(id);
        if (!alert) {
          return res.status(404).json(apiResponse.error('Alert not found', 404));
        }
        return res.status(200).json(apiResponse.success(alert, 'Alert dismissed'));
      }
      res.status(400).json(apiResponse.error('Unsupported status', 400));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async rebalanceAllocations(req, res) {
    try {
      const { updates } = req.body ?? {};
      const result = await SkuAllocationService.rebalance(updates ?? []);
      res.status(200).json(apiResponse.success(result, 'Rebalance completed'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async autoRebalance(req, res) {
    try {
      const result = await SkuAllocationService.autoRebalance(req.body ?? {});
      res.status(200).json(apiResponse.success(result, 'Auto rebalance completed'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async seedAllocationData(req, res) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json(apiResponse.error('Seed is disabled in production', 403));
    }
    try {
      const result = await SkuAllocationService.seedAllocationData();
      res.status(200).json(apiResponse.success(result, 'Allocation data seeded'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getLocations(req, res) {
    try {
      const locations = await SkuAllocationService.listLocations();
      res.status(200).json(apiResponse.success(locations, 'Locations retrieved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async createTransferOrder(req, res) {
    try {
      const createdBy = req.user?.id || req.user?._id;
      const order = await SkuAllocationService.createTransferFromAllocation(req.body, createdBy);
      res.status(201).json(apiResponse.success(order, 'Transfer order created successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }
}

module.exports = AllocationController;
