const { SalesAnalytics, InventoryAnalytics, DemandForecast, SalesForecast } = require('../models/analyticsModels');
const { generateId } = require('../../utils/idGenerator');

class AnalyticsService {
  static async calculateSalesAnalytics(period = 'DAILY') {
    try {
      const analyticsId = `SALES-${generateId()}`;
      
      const analytics = new SalesAnalytics({
        analyticsId,
        period,
        metrics: {
          totalSales: Math.floor(Math.random() * 500000) + 100000,
          totalUnits: Math.floor(Math.random() * 10000) + 1000,
          averageOrderValue: Math.floor(Math.random() * 500) + 100,
          conversionRate: Math.random() * 5 + 0.5,
          transactionCount: Math.floor(Math.random() * 5000) + 500,
          uniqueCustomers: Math.floor(Math.random() * 2000) + 200,
        },
        trends: {
          weekOverWeek: Math.random() * 20 - 10,
          monthOverMonth: Math.random() * 25 - 10,
          yearOverYear: Math.random() * 50 - 20,
        },
      });

      await analytics.save();
      return analytics;
    } catch (error) {
      throw new Error(`Failed to calculate sales analytics: ${error.message}`);
    }
  }

  static async calculateInventoryAnalytics() {
    try {
      const analyticsId = `INV-${generateId()}`;
      
      const analytics = new InventoryAnalytics({
        analyticsId,
        metrics: {
          totalInventory: Math.floor(Math.random() * 100000) + 10000,
          totalSKUs: Math.floor(Math.random() * 5000) + 1000,
          averageInventoryAge: Math.floor(Math.random() * 60) + 5,
          turnoverRate: Math.random() * 10 + 2,
          stockOutPercentage: Math.random() * 10 + 1,
          overStockPercentage: Math.random() * 15 + 5,
        },
        riskIndicators: {
          slowMovingCount: Math.floor(Math.random() * 500) + 50,
          deadStockCount: Math.floor(Math.random() * 200) + 10,
          expiringCount: Math.floor(Math.random() * 100) + 5,
          lowStockCount: Math.floor(Math.random() * 300) + 30,
        },
      });

      await analytics.save();
      return analytics;
    } catch (error) {
      throw new Error(`Failed to calculate inventory analytics: ${error.message}`);
    }
  }

  static async getSalesAnalyticsPeriod(period, daysBack = 30) {
    try {
      const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
      return await SalesAnalytics.find({
        period,
        createdAt: { $gte: cutoffDate }
      }).sort({ createdAt: -1 });
    } catch (error) {
      throw new Error(`Failed to get sales analytics: ${error.message}`);
    }
  }

  static async getInventoryAnalyticsPeriod(daysBack = 30) {
    try {
      const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
      return await InventoryAnalytics.find({
        createdAt: { $gte: cutoffDate }
      }).sort({ createdAt: -1 });
    } catch (error) {
      throw new Error(`Failed to get inventory analytics: ${error.message}`);
    }
  }

  static async getTrendAnalysis() {
    try {
      const latestSales = await SalesAnalytics.findOne({}).sort({ createdAt: -1 });
      const latestInventory = await InventoryAnalytics.findOne({}).sort({ createdAt: -1 });

      return {
        sales: latestSales?.trends || {},
        inventory: latestInventory?.metrics || {},
        timestamp: new Date(),
      };
    } catch (error) {
      throw new Error(`Failed to get trend analysis: ${error.message}`);
    }
  }
}

class ForecastingService {
  static async createDemandForecast(sku, daysAhead = 30) {
    try {
      const forecastId = `DFORECAST-${generateId()}`;
      const startDate = new Date();
      const endDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

      const forecasts = [];
      for (let i = 0; i < daysAhead; i++) {
        const date = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
        const baseDemand = Math.floor(Math.random() * 1000) + 100;
        forecasts.push({
          date,
          predictedDemand: baseDemand,
          confidence: 85 + Math.random() * 10,
          lower_bound: baseDemand * 0.85,
          upper_bound: baseDemand * 1.15,
        });
      }

      const forecast = new DemandForecast({
        forecastId,
        sku,
        forecastPeriod: { startDate, endDate, daysAhead },
        forecasts,
        method: 'TIME_SERIES',
        accuracy: {
          mape: Math.random() * 10 + 5,
          rmse: Math.random() * 50 + 20,
          mae: Math.random() * 30 + 10,
        },
      });

      await forecast.save();
      return forecast;
    } catch (error) {
      throw new Error(`Failed to create demand forecast: ${error.message}`);
    }
  }

  static async createSalesForecast(daysAhead = 30) {
    try {
      const forecastId = `SFORECAST-${generateId()}`;
      const startDate = new Date();
      const endDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

      const forecasts = [];
      for (let i = 0; i < daysAhead; i++) {
        const date = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
        const baseSales = Math.floor(Math.random() * 100000) + 50000;
        forecasts.push({
          date,
          predictedSales: baseSales,
          predictedUnits: Math.floor(baseSales / 100),
          confidence: 80 + Math.random() * 15,
        });
      }

      const forecast = new SalesForecast({
        forecastId,
        forecastPeriod: { startDate, endDate, daysAhead },
        forecasts,
        scenarioAnalysis: [
          { scenario: 'PESSIMISTIC', salesForecast: Math.floor(Math.random() * 800000) + 200000, unitsForecast: 2000 },
          { scenario: 'BASE', salesForecast: Math.floor(Math.random() * 1000000) + 500000, unitsForecast: 5000 },
          { scenario: 'OPTIMISTIC', salesForecast: Math.floor(Math.random() * 1500000) + 800000, unitsForecast: 8000 },
        ],
        method: 'ML_MODEL',
        accuracy: { mape: 8, rmse: 45 },
      });

      await forecast.save();
      return forecast;
    } catch (error) {
      throw new Error(`Failed to create sales forecast: ${error.message}`);
    }
  }

  static async getDemandForecast(sku) {
    try {
      return await DemandForecast.findOne({ sku }).sort({ createdAt: -1 });
    } catch (error) {
      throw new Error(`Failed to get demand forecast: ${error.message}`);
    }
  }

  static async getSalesForecast() {
    try {
      return await SalesForecast.findOne({}).sort({ createdAt: -1 });
    } catch (error) {
      throw new Error(`Failed to get sales forecast: ${error.message}`);
    }
  }

  static async updateForecast(forecastId, accuracy) {
    try {
      return await DemandForecast.findOneAndUpdate(
        { forecastId },
        { accuracy, lastUpdated: new Date() },
        { new: true }
      );
    } catch (error) {
      throw new Error(`Failed to update forecast: ${error.message}`);
    }
  }

  static async getAllForecasts() {
    try {
      const demand = await DemandForecast.find({}).sort({ createdAt: -1 });
      const sales = await SalesForecast.find({}).sort({ createdAt: -1 });
      return { demand, sales };
    } catch (error) {
      throw new Error(`Failed to get all forecasts: ${error.message}`);
    }
  }
}

module.exports = {
  AnalyticsService,
  ForecastingService,
};
