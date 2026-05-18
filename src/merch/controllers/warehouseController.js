const WarehouseService = require('../services/warehouseService');
const { apiResponse } = require('../../utils/apiResponse');

class WarehouseController {
  static async createWarehouse(req, res) {
    try {
      const warehouse = await WarehouseService.createWarehouse(req.body);
      res.status(201).json(apiResponse.success(warehouse, 'Warehouse created successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getWarehouse(req, res) {
    try {
      const { warehouseId } = req.params;
      const warehouse = await WarehouseService.getWarehouse(warehouseId);
      
      if (!warehouse) {
        return res.status(404).json(apiResponse.error('Warehouse not found', 404));
      }

      res.status(200).json(apiResponse.success(warehouse, 'Warehouse retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getWarehouseHierarchy(req, res) {
    try {
      const { warehouseId } = req.params;
      const hierarchy = await WarehouseService.getWarehouseHierarchy(warehouseId);
      
      if (!hierarchy) {
        return res.status(404).json(apiResponse.error('Warehouse not found', 404));
      }

      res.status(200).json(apiResponse.success(hierarchy, 'Warehouse hierarchy retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getCapacityUtilization(req, res) {
    try {
      const { warehouseId } = req.params;
      const capacity = await WarehouseService.getCapacityUtilization(warehouseId);
      res.status(200).json(apiResponse.success(capacity, 'Capacity utilization retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async updateWarehouseStatus(req, res) {
    try {
      const { warehouseId } = req.params;
      const { isActive } = req.body;
      const warehouse = await WarehouseService.updateWarehouseStatus(warehouseId, isActive);
      
      if (!warehouse) {
        return res.status(404).json(apiResponse.error('Warehouse not found', 404));
      }

      res.status(200).json(apiResponse.success(warehouse, 'Warehouse status updated successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getWarehousesByTier(req, res) {
    try {
      const { tier } = req.params;
      const warehouses = await WarehouseService.getWarehousesByTier(parseInt(tier));
      res.status(200).json(apiResponse.success(warehouses, 'Warehouses retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async calculateDistanceMetrics(req, res) {
    try {
      const { sourceId, destId } = req.query;
      const metrics = await WarehouseService.calculateDistanceMetrics(sourceId, destId);
      res.status(200).json(apiResponse.success(metrics, 'Distance metrics calculated successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getAllWarehouses(req, res) {
    try {
      const warehouses = await WarehouseService.getAllWarehouses();
      res.status(200).json(apiResponse.success(warehouses, 'All warehouses retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async updateWarehouse(req, res) {
    try {
      const { warehouseId } = req.params;
      const warehouse = await WarehouseService.updateWarehouse(warehouseId, req.body);
      
      if (!warehouse) {
        return res.status(404).json(apiResponse.error('Warehouse not found', 404));
      }

      res.status(200).json(apiResponse.success(warehouse, 'Warehouse updated successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }
}

module.exports = WarehouseController;
