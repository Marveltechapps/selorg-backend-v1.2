const Warehouse = require('../models/Warehouse');
const { generateId } = require('../../utils/idGenerator');

class WarehouseService {
  static async createWarehouse(data) {
    try {
      const warehouseId = `WH-${generateId()}`;
      const warehouse = new Warehouse({
        ...data,
        warehouseId,
      });
      await warehouse.save();
      return warehouse;
    } catch (error) {
      throw new Error(`Failed to create warehouse: ${error.message}`);
    }
  }

  static async getWarehouse(warehouseId) {
    try {
      return await Warehouse.findOne({ warehouseId })
        .populate('parentWarehouse')
        .populate('childWarehouses');
    } catch (error) {
      throw new Error(`Failed to get warehouse: ${error.message}`);
    }
  }

  static async getWarehouseHierarchy(warehouseId) {
    try {
      const warehouse = await Warehouse.findOne({ warehouseId })
        .populate('childWarehouses');
      
      if (!warehouse) return null;

      const hierarchy = {
        ...warehouse.toObject(),
        children: [],
      };

      if (warehouse.childWarehouses && warehouse.childWarehouses.length > 0) {
        for (const childId of warehouse.childWarehouses) {
          const childWarehouse = await this.getWarehouse(childId);
          hierarchy.children.push(childWarehouse);
        }
      }

      return hierarchy;
    } catch (error) {
      throw new Error(`Failed to get warehouse hierarchy: ${error.message}`);
    }
  }

  static async getCapacityUtilization(warehouseId) {
    try {
      const warehouse = await Warehouse.findOne({ warehouseId });
      if (!warehouse) throw new Error('Warehouse not found');

      const utilizationPercentage = (warehouse.capacity.currentUtilization / warehouse.capacity.maxCapacity) * 100;
      
      return {
        warehouseId,
        maxCapacity: warehouse.capacity.maxCapacity,
        currentUtilization: warehouse.capacity.currentUtilization,
        utilizationPercentage: Math.round(utilizationPercentage),
        availableCapacity: warehouse.capacity.maxCapacity - warehouse.capacity.currentUtilization,
      };
    } catch (error) {
      throw new Error(`Failed to get capacity utilization: ${error.message}`);
    }
  }

  static async updateWarehouseStatus(warehouseId, isActive) {
    try {
      const warehouse = await Warehouse.findOneAndUpdate(
        { warehouseId },
        { isActive, updatedAt: new Date() },
        { new: true },
      );
      return warehouse;
    } catch (error) {
      throw new Error(`Failed to update warehouse status: ${error.message}`);
    }
  }

  static async getWarehousesByTier(tier) {
    try {
      return await Warehouse.find({ tier, isActive: true });
    } catch (error) {
      throw new Error(`Failed to get warehouses by tier: ${error.message}`);
    }
  }

  static async calculateDistanceMetrics(sourceId, destinationId) {
    try {
      const source = await Warehouse.findOne({ warehouseId: sourceId });
      const destination = await Warehouse.findOne({ warehouseId: destinationId });

      if (!source || !destination) {
        throw new Error('Source or destination warehouse not found');
      }

      // Simple distance calculation using Haversine formula
      const R = 6371; // Earth's radius in km
      const lat1 = source.location.coordinates.latitude;
      const lon1 = source.location.coordinates.longitude;
      const lat2 = destination.location.coordinates.latitude;
      const lon2 = destination.location.coordinates.longitude;

      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;

      // Estimate transit days (average speed 500 km/day)
      const estimatedDays = Math.ceil(distance / 500);

      return {
        distance,
        estimatedDays,
        source: source.warehouseId,
        destination: destination.warehouseId,
      };
    } catch (error) {
      throw new Error(`Failed to calculate distance metrics: ${error.message}`);
    }
  }

  static async getAllWarehouses() {
    try {
      return await Warehouse.find({ isActive: true });
    } catch (error) {
      throw new Error(`Failed to get all warehouses: ${error.message}`);
    }
  }

  static async updateWarehouse(warehouseId, updates) {
    try {
      const warehouse = await Warehouse.findOneAndUpdate(
        { warehouseId },
        { ...updates, updatedAt: new Date() },
        { new: true },
      );
      return warehouse;
    } catch (error) {
      throw new Error(`Failed to update warehouse: ${error.message}`);
    }
  }
}

module.exports = WarehouseService;
