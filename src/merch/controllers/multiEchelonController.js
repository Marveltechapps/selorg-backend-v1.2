const MultiEchelonService = require('../services/multiEchelonService');
const { apiResponse } = require('../../utils/apiResponse');

class MultiEchelonController {
  static async getEchelonInventory(req, res) {
    try {
      const { sku } = req.params;
      const inventory = await MultiEchelonService.getAllEchelonInventory(sku);
      res.status(200).json(apiResponse.success(inventory, 'Echelon inventory retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getSystemInventory(req, res) {
    try {
      const { sku } = req.params;
      const inventory = await MultiEchelonService.calculateSystemInventory(sku);
      res.status(200).json(apiResponse.success(inventory, 'System inventory calculated successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getEchelonVisibility(req, res) {
    try {
      const { sku } = req.params;
      const visibility = await MultiEchelonService.getEchelonVisibility(sku);
      res.status(200).json(apiResponse.success(visibility, 'Echelon visibility retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async synchronizeEchelonData(req, res) {
    try {
      const result = await MultiEchelonService.synchronizeEchelonData();
      res.status(200).json(apiResponse.success(result, 'Echelon data synchronized successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async suggestRebalancing(req, res) {
    try {
      const { sku } = req.params;
      const suggestions = await MultiEchelonService.suggestEchelonRebalancing(sku);
      res.status(200).json(apiResponse.success(suggestions, 'Rebalancing suggestions retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async trackInventoryFlow(req, res) {
    try {
      const { sku } = req.params;
      const { sourceWarehouse, destinationWarehouse } = req.query;
      const flow = await MultiEchelonService.trackInventoryFlow(sku, sourceWarehouse, destinationWarehouse);
      res.status(200).json(apiResponse.success(flow, 'Inventory flow tracked successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async createEchelonRecord(req, res) {
    try {
      const { sku, warehouseId, tierData } = req.body;
      const echelon = await MultiEchelonService.createEchelonRecord(sku, warehouseId, tierData);
      res.status(201).json(apiResponse.success(echelon, 'Echelon record created successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async aggregateInventory(req, res) {
    try {
      const { sku } = req.params;
      const aggregated = await MultiEchelonService.aggregateInventoryAcrossEchelon(sku);
      res.status(200).json(apiResponse.success(aggregated, 'Inventory aggregated successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }
}

module.exports = MultiEchelonController;
