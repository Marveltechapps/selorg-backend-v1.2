const TransferOrder = require('../models/TransferOrder');
const WarehouseService = require('./warehouseService');
const InventoryService = require('./inventoryService');
const { generateId } = require('../../utils/idGenerator');

class TransferOrderService {
  static async createTransferOrder(sourceId, destId, items, createdBy) {
    try {
      const transferId = `TO-${generateId()}`;
      const referenceNumber = `TRF-${Date.now()}`;

      // Calculate total value
      const totalValue = items.reduce((sum, item) => sum + (item.quantityRequested * item.unitCost || 0), 0);

      // Get distance metrics for estimated delivery
      const distance = await WarehouseService.calculateDistanceMetrics(sourceId, destId);

      const transferOrder = new TransferOrder({
        transferId,
        referenceNumber,
        sourceWarehouse: sourceId,
        destinationWarehouse: destId,
        items: items.map(item => ({
          ...item,
          quantityShipped: 0,
          quantityReceived: 0,
        })),
        totalValue,
        shippingInfo: {
          estimatedDays: distance.estimatedDays,
        },
        createdBy,
      });

      await transferOrder.save();
      return transferOrder;
    } catch (error) {
      throw new Error(`Failed to create transfer order: ${error.message}`);
    }
  }

  static async getTransferOrder(transferId) {
    try {
      return await TransferOrder.findOne({ transferId })
        .populate('sourceWarehouse')
        .populate('destinationWarehouse');
    } catch (error) {
      throw new Error(`Failed to get transfer order: ${error.message}`);
    }
  }

  static async approveTransferOrder(transferId, approver, comments = '') {
    try {
      const transferOrder = await TransferOrder.findOneAndUpdate(
        { transferId },
        {
          status: 'APPROVED',
          $push: {
            approvals: {
              approver,
              approvalDate: new Date(),
              comments,
            },
          },
          'timeline.approvedDate': new Date(),
          updatedAt: new Date(),
        },
        { new: true },
      );
      return transferOrder;
    } catch (error) {
      throw new Error(`Failed to approve transfer order: ${error.message}`);
    }
  }

  static async shipTransferOrder(transferId, shippingInfo, updatedBy) {
    try {
      const transferOrder = await TransferOrder.findOneAndUpdate(
        { transferId },
        {
          status: 'SHIPPED',
          shippingInfo: {
            ...shippingInfo,
            estimatedDays: shippingInfo.estimatedDays || 3,
          },
          'timeline.shipmentDate': new Date(),
          'timeline.expectedDeliveryDate': new Date(Date.now() + (shippingInfo.estimatedDays || 3) * 24 * 60 * 60 * 1000),
          updatedBy,
          updatedAt: new Date(),
        },
        { new: true },
      );
      return transferOrder;
    } catch (error) {
      throw new Error(`Failed to ship transfer order: ${error.message}`);
    }
  }

  static async receiveTransferOrder(transferId, receivedItems, updatedBy) {
    try {
      const transferOrder = await TransferOrder.findOne({ transferId });
      if (!transferOrder) throw new Error('Transfer order not found');

      // Update received quantities
      transferOrder.items = transferOrder.items.map(item => {
        const received = receivedItems.find(r => r.sku === item.sku);
        return {
          ...item,
          quantityReceived: received ? received.quantityReceived : 0,
        };
      });

      transferOrder.status = 'RECEIVED';
      transferOrder.timeline.actualDeliveryDate = new Date();
      transferOrder.updatedBy = updatedBy;
      transferOrder.updatedAt = new Date();

      await transferOrder.save();

      // Update inventory at destination warehouse
      for (const item of transferOrder.items) {
        await InventoryService.recordTransaction({
          transactionType: 'INBOUND_TRANSFER',
          sku: item.sku,
          quantity: item.quantityReceived,
          storeId: transferOrder.destinationWarehouse,
          referenceId: transferId,
          createdBy: updatedBy,
        });
      }

      return transferOrder;
    } catch (error) {
      throw new Error(`Failed to receive transfer order: ${error.message}`);
    }
  }

  static async cancelTransferOrder(transferId, reason, updatedBy) {
    try {
      const transferOrder = await TransferOrder.findOneAndUpdate(
        { transferId },
        {
          status: 'CANCELLED',
          updatedBy,
          updatedAt: new Date(),
        },
        { new: true },
      );
      return transferOrder;
    } catch (error) {
      throw new Error(`Failed to cancel transfer order: ${error.message}`);
    }
  }

  static async getTransferOrdersByWarehouse(warehouseId, role = 'source') {
    try {
      const query = role === 'source' 
        ? { sourceWarehouse: warehouseId }
        : { destinationWarehouse: warehouseId };
      
      return await TransferOrder.find(query)
        .populate('sourceWarehouse')
        .populate('destinationWarehouse');
    } catch (error) {
      throw new Error(`Failed to get transfer orders: ${error.message}`);
    }
  }

  static async getTransferOrdersByStatus(status) {
    try {
      return await TransferOrder.find({ status })
        .populate('sourceWarehouse')
        .populate('destinationWarehouse');
    } catch (error) {
      throw new Error(`Failed to get transfer orders by status: ${error.message}`);
    }
  }

  static async calculateTransferCost(source, dest, items) {
    try {
      const distance = await WarehouseService.calculateDistanceMetrics(source, dest);
      
      // Cost estimation: base cost + distance cost + item cost
      const baseCost = 50;
      const distanceCost = distance.distance * 0.5; // $0.50 per km
      const itemCost = items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
      const totalCost = baseCost + distanceCost + itemCost;

      return {
        baseCost,
        distanceCost,
        itemCost,
        totalCost,
        distance: distance.distance,
        estimatedDays: distance.estimatedDays,
      };
    } catch (error) {
      throw new Error(`Failed to calculate transfer cost: ${error.message}`);
    }
  }

  static async getAllTransferOrders() {
    try {
      return await TransferOrder.find({})
        .populate('sourceWarehouse')
        .populate('destinationWarehouse');
    } catch (error) {
      throw new Error(`Failed to get all transfer orders: ${error.message}`);
    }
  }
}

module.exports = TransferOrderService;
