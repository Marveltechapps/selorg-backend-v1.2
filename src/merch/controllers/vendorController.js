const VendorService = require('../services/vendorService');
const { apiResponse } = require('../../utils/apiResponse');

class VendorController {
  static async createVendor(req, res) {
    try {
      const vendor = await VendorService.createVendor(req.body);
      res.status(201).json(apiResponse.success(vendor, 'Vendor created successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getVendor(req, res) {
    try {
      const { vendorId } = req.params;
      const vendor = await VendorService.getVendor(vendorId);
      
      if (!vendor) {
        return res.status(404).json(apiResponse.error('Vendor not found', 404));
      }

      res.status(200).json(apiResponse.success(vendor, 'Vendor retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async updateVendor(req, res) {
    try {
      const { vendorId } = req.params;
      const vendor = await VendorService.updateVendor(vendorId, req.body);
      
      if (!vendor) {
        return res.status(404).json(apiResponse.error('Vendor not found', 404));
      }

      res.status(200).json(apiResponse.success(vendor, 'Vendor updated successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async calculatePerformanceMetrics(req, res) {
    try {
      const { vendorId } = req.params;
      const metrics = await VendorService.calculatePerformanceMetrics(vendorId);
      res.status(200).json(apiResponse.success(metrics, 'Performance metrics calculated successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getVendorsByType(req, res) {
    try {
      const { vendorType } = req.params;
      const vendors = await VendorService.getVendorsByType(vendorType);
      res.status(200).json(apiResponse.success(vendors, 'Vendors retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async rankVendorsByPerformance(req, res) {
    try {
      const ranked = await VendorService.rankVendorsByPerformance();
      res.status(200).json(apiResponse.success(ranked, 'Vendors ranked successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async updatePaymentTerms(req, res) {
    try {
      const { vendorId } = req.params;
      const { terms } = req.body;
      const vendor = await VendorService.updatePaymentTerms(vendorId, terms);
      res.status(200).json(apiResponse.success(vendor, 'Payment terms updated successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getVendorSupplyCapacity(req, res) {
    try {
      const { vendorId } = req.params;
      const capacity = await VendorService.getVendorSupplyCapacity(vendorId);
      res.status(200).json(apiResponse.success(capacity, 'Vendor supply capacity retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getAllVendors(req, res) {
    try {
      const vendors = await VendorService.getAllVendors();
      res.status(200).json(apiResponse.success(vendors, 'All vendors retrieved successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async deactivateVendor(req, res) {
    try {
      const { vendorId } = req.params;
      const vendor = await VendorService.deactivateVendor(vendorId);
      res.status(200).json(apiResponse.success(vendor, 'Vendor deactivated successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }
}

module.exports = VendorController;
