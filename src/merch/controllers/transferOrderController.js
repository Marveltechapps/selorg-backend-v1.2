const TransferOrderService = require('../services/transferOrderService');
const { apiResponse } = require('../../utils/apiResponse');

class TransferOrderController {
  static async createTransferOrder(req, res) {
    try {
      const { sourceId, destId, items, createdBy } = req.body;
      const transferOrder = await TransferOrderService.createTransferOrder(sourceId, destId, items, createdBy);
      res.status(201).json(apiResponse.success(transferOrder, 'Transfer order created successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getTransferOrder(req, res) {
    try {
      const { transferId } = req.params;
      const transferOrder = await TransferOrderService.getTransferOrder(transferId);
      
      if (!transferOrder) {
        return res.status(404).json(apiResponse.error('Transfer order not found', 404));
      }

      res.status(200).json(apiResponse.success(transferOrder, 'Transfer order retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async approveTransferOrder(req, res) {
    try {
      const { transferId } = req.params;
      const { approver, comments } = req.body;
      const transferOrder = await TransferOrderService.approveTransferOrder(transferId, approver, comments);
      res.status(200).json(apiResponse.success(transferOrder, 'Transfer order approved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async shipTransferOrder(req, res) {
    try {
      const { transferId } = req.params;
      const { shippingInfo, updatedBy } = req.body;
      const transferOrder = await TransferOrderService.shipTransferOrder(transferId, shippingInfo, updatedBy);
      res.status(200).json(apiResponse.success(transferOrder, 'Transfer order shipped successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async receiveTransferOrder(req, res) {
    try {
      const { transferId } = req.params;
      const { receivedItems, updatedBy } = req.body;
      const transferOrder = await TransferOrderService.receiveTransferOrder(transferId, receivedItems, updatedBy);
      res.status(200).json(apiResponse.success(transferOrder, 'Transfer order received successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async cancelTransferOrder(req, res) {
    try {
      const { transferId } = req.params;
      const { reason, updatedBy } = req.body;
      const transferOrder = await TransferOrderService.cancelTransferOrder(transferId, reason, updatedBy);
      res.status(200).json(apiResponse.success(transferOrder, 'Transfer order cancelled successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getTransferOrdersByWarehouse(req, res) {
    try {
      const { warehouseId } = req.params;
      const { role } = req.query;
      const transferOrders = await TransferOrderService.getTransferOrdersByWarehouse(warehouseId, role);
      res.status(200).json(apiResponse.success(transferOrders, 'Transfer orders retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getTransferOrdersByStatus(req, res) {
    try {
      const { status } = req.query;
      const transferOrders = await TransferOrderService.getTransferOrdersByStatus(status);
      res.status(200).json(apiResponse.success(transferOrders, 'Transfer orders retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async calculateTransferCost(req, res) {
    try {
      const { source, dest, items } = req.body;
      const cost = await TransferOrderService.calculateTransferCost(source, dest, items);
      res.status(200).json(apiResponse.success(cost, 'Transfer cost calculated successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getAllTransferOrders(req, res) {
    try {
      const transferOrders = await TransferOrderService.getAllTransferOrders();
      res.status(200).json(apiResponse.success(transferOrders, 'All transfer orders retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }
}

module.exports = TransferOrderController;
