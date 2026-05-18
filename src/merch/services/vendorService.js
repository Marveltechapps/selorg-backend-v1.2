const VendorProfile = require('../models/VendorProfile');
const { generateId } = require('../../utils/idGenerator');

class VendorService {
  static async createVendor(data) {
    try {
      const vendorId = `VEN-${generateId()}`;
      const vendor = new VendorProfile({
        ...data,
        vendorId,
      });
      await vendor.save();
      return vendor;
    } catch (error) {
      throw new Error(`Failed to create vendor: ${error.message}`);
    }
  }

  static async getVendor(vendorId) {
    try {
      return await VendorProfile.findOne({ vendorId });
    } catch (error) {
      throw new Error(`Failed to get vendor: ${error.message}`);
    }
  }

  static async updateVendor(vendorId, updates) {
    try {
      const vendor = await VendorProfile.findOneAndUpdate(
        { vendorId },
        { ...updates, updatedAt: new Date() },
        { new: true },
      );
      return vendor;
    } catch (error) {
      throw new Error(`Failed to update vendor: ${error.message}`);
    }
  }

  static async calculatePerformanceMetrics(vendorId) {
    try {
      const vendor = await VendorProfile.findOne({ vendorId });
      if (!vendor) throw new Error('Vendor not found');

      // Calculate metrics based on orders (assuming order data exists elsewhere)
      const metrics = {
        onTimeDeliveryPercentage: vendor.performanceMetrics.successfulOrders > 0 
          ? (vendor.performanceMetrics.successfulOrders / vendor.performanceMetrics.totalOrders) * 100 
          : 0,
        qualityScore: vendor.performanceMetrics.qualityScore,
        responseTime: vendor.performanceMetrics.responseTime,
        reliabilityScore: vendor.performanceMetrics.reliabilityScore,
        totalOrders: vendor.performanceMetrics.totalOrders,
        successfulOrders: vendor.performanceMetrics.successfulOrders,
      };

      return metrics;
    } catch (error) {
      throw new Error(`Failed to calculate vendor metrics: ${error.message}`);
    }
  }

  static async getVendorsByType(vendorType) {
    try {
      return await VendorProfile.find({ vendorType, isActive: true });
    } catch (error) {
      throw new Error(`Failed to get vendors by type: ${error.message}`);
    }
  }

  static async rankVendorsByPerformance() {
    try {
      const vendors = await VendorProfile.find({ isActive: true });
      
      const ranked = vendors.map(vendor => ({
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
        score: (vendor.performanceMetrics.reliabilityScore + 
                vendor.performanceMetrics.qualityScore) / 2,
        onTimeDelivery: vendor.performanceMetrics.onTimeDeliveryPercentage,
      })).sort((a, b) => b.score - a.score);

      return ranked;
    } catch (error) {
      throw new Error(`Failed to rank vendors: ${error.message}`);
    }
  }

  static async updatePaymentTerms(vendorId, terms) {
    try {
      const vendor = await VendorProfile.findOneAndUpdate(
        { vendorId },
        { paymentTerms: terms, updatedAt: new Date() },
        { new: true },
      );
      return vendor;
    } catch (error) {
      throw new Error(`Failed to update payment terms: ${error.message}`);
    }
  }

  static async getVendorSupplyCapacity(vendorId) {
    try {
      const vendor = await VendorProfile.findOne({ vendorId });
      if (!vendor) throw new Error('Vendor not found');

      // Mock capacity calculation
      const capacityPercentage = (vendor.performanceMetrics.successfulOrders / 
                                   Math.max(vendor.performanceMetrics.totalOrders, 1)) * 100;

      return {
        vendorId,
        vendorName: vendor.vendorName,
        suppliedAmount: vendor.performanceMetrics.successfulOrders * 1000, // Mock calculation
        capacityPercentage: Math.round(capacityPercentage),
        reliabilityScore: vendor.performanceMetrics.reliabilityScore,
      };
    } catch (error) {
      throw new Error(`Failed to get vendor supply capacity: ${error.message}`);
    }
  }

  static async getAllVendors() {
    try {
      return await VendorProfile.find({ isActive: true });
    } catch (error) {
      throw new Error(`Failed to get all vendors: ${error.message}`);
    }
  }

  static async deactivateVendor(vendorId) {
    try {
      const vendor = await VendorProfile.findOneAndUpdate(
        { vendorId },
        { isActive: false, updatedAt: new Date() },
        { new: true },
      );
      return vendor;
    } catch (error) {
      throw new Error(`Failed to deactivate vendor: ${error.message}`);
    }
  }
}

module.exports = VendorService;
