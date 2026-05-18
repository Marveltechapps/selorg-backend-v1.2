const { AnalyticsService, ForecastingService } = require('../services/analyticsServices');
const { apiResponse } = require('../../utils/apiResponse');

class AnalyticsController {
  static async calculateSalesAnalytics(req, res) {
    try {
      const { period } = req.body;
      const analytics = await AnalyticsService.calculateSalesAnalytics(period || 'DAILY');
      res.status(201).json(apiResponse.success(analytics, 'Sales analytics calculated'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async calculateInventoryAnalytics(req, res) {
    try {
      const analytics = await AnalyticsService.calculateInventoryAnalytics();
      res.status(201).json(apiResponse.success(analytics, 'Inventory analytics calculated'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getSalesAnalytics(req, res) {
    try {
      const { period, daysBack } = req.query;
      const analytics = await AnalyticsService.getSalesAnalyticsPeriod(period || 'DAILY', parseInt(daysBack) || 30);
      res.status(200).json(apiResponse.success(analytics, 'Sales analytics retrieved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getInventoryAnalytics(req, res) {
    try {
      const { daysBack } = req.query;
      const analytics = await AnalyticsService.getInventoryAnalyticsPeriod(parseInt(daysBack) || 30);
      res.status(200).json(apiResponse.success(analytics, 'Inventory analytics retrieved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getTrendAnalysis(req, res) {
    try {
      const trends = await AnalyticsService.getTrendAnalysis();
      res.status(200).json(apiResponse.success(trends, 'Trend analysis retrieved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }
}

class ForecastController {
  static async createDemandForecast(req, res) {
    try {
      const { sku, daysAhead } = req.body;
      const forecast = await ForecastingService.createDemandForecast(sku, daysAhead || 30);
      res.status(201).json(apiResponse.success(forecast, 'Demand forecast created'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async createSalesForecast(req, res) {
    try {
      const { daysAhead } = req.body;
      const forecast = await ForecastingService.createSalesForecast(daysAhead || 30);
      res.status(201).json(apiResponse.success(forecast, 'Sales forecast created'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getDemandForecast(req, res) {
    try {
      const { sku } = req.params;
      const forecast = await ForecastingService.getDemandForecast(sku);
      res.status(200).json(apiResponse.success(forecast, 'Demand forecast retrieved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getSalesForecast(req, res) {
    try {
      const forecast = await ForecastingService.getSalesForecast();
      res.status(200).json(apiResponse.success(forecast, 'Sales forecast retrieved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getAllForecasts(req, res) {
    try {
      const forecasts = await ForecastingService.getAllForecasts();
      res.status(200).json(apiResponse.success(forecasts, 'All forecasts retrieved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }
}

class DashboardController {
  static async getExecutiveDashboard(req, res) {
    try {
      const salesTrends = await AnalyticsService.getTrendAnalysis();
      const forecasts = await ForecastingService.getAllForecasts();
      
      const dashboard = {
        sales: salesTrends.sales,
        inventory: salesTrends.inventory,
        forecasts,
        timestamp: new Date(),
        kpis: {
          salesTrend: salesTrends.sales.monthOverMonth || 0,
          inventoryTurnover: salesTrends.inventory.turnoverRate || 0,
          stockOutRate: salesTrends.inventory.stockOutPercentage || 0,
        },
      };

      res.status(200).json(apiResponse.success(dashboard, 'Executive dashboard retrieved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getSalesMetricsDashboard(req, res) {
    try {
      const { daysBack } = req.query;
      const sales = await AnalyticsService.getSalesAnalyticsPeriod('DAILY', parseInt(daysBack) || 30);
      res.status(200).json(apiResponse.success(sales, 'Sales metrics dashboard retrieved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getInventoryMetricsDashboard(req, res) {
    try {
      const { daysBack } = req.query;
      const inventory = await AnalyticsService.getInventoryAnalyticsPeriod(parseInt(daysBack) || 30);
      res.status(200).json(apiResponse.success(inventory, 'Inventory metrics dashboard retrieved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getForecastingDashboard(req, res) {
    try {
      const forecasts = await ForecastingService.getAllForecasts();
      res.status(200).json(apiResponse.success(forecasts, 'Forecasting dashboard retrieved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }
}

module.exports = {
  AnalyticsController,
  ForecastController,
  DashboardController,
};
