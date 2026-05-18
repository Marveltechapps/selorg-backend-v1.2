const CompetitorPrice = require('../models/CompetitorPrice');
const { generateId } = require('../../utils/idGenerator');

class CompetitorService {
  static async trackCompetitorPrice(data) {
    try {
      const trackingId = `TRACK-${generateId()}`;
      const tracking = new CompetitorPrice({
        ...data,
        trackingId,
      });
      await tracking.save();
      return tracking;
    } catch (error) {
      throw new Error(`Failed to track competitor price: ${error.message}`);
    }
  }

  static async updateCompetitorPrice(trackingId, newPrice, newAvailability = null) {
    try {
      const tracking = await CompetitorPrice.findOne({ trackingId });
      if (!tracking) throw new Error('Tracking record not found');

      const priceDiff = newPrice - tracking.ourPrice;
      const priceDiffPercent = (priceDiff / tracking.ourPrice) * 100;

      let priceStatus = 'EQUAL';
      if (priceDiff > 0) priceStatus = 'HIGHER';
      if (priceDiff < 0) priceStatus = 'LOWER';

      const update = {
        competitorPrice: newPrice,
        priceDifference: priceDiff,
        pricePercentageDifference: priceDiffPercent,
        priceStatus,
        lastUpdated: new Date(),
      };

      if (newAvailability) {
        update['availability.competitorStock'] = newAvailability;
      }

      // Add to price history
      await CompetitorPrice.updateOne(
        { trackingId },
        {
          $push: {
            priceHistory: {
              date: new Date(),
              price: newPrice,
            },
          },
        }
      );

      return await CompetitorPrice.findOneAndUpdate(
        { trackingId },
        update,
        { new: true }
      );
    } catch (error) {
      throw new Error(`Failed to update competitor price: ${error.message}`);
    }
  }

  static async getPriceComparison(sku) {
    try {
      const comparisons = await CompetitorPrice.find({ sku });
      const summary = {
        sku,
        count: comparisons.length,
        averageCompetitorPrice: 0,
        lowestPrice: null,
        highestPrice: null,
        ourPrice: null,
      };

      if (comparisons.length > 0) {
        const prices = comparisons.map(c => c.competitorPrice);
        summary.averageCompetitorPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        summary.lowestPrice = Math.min(...prices);
        summary.highestPrice = Math.max(...prices);
        summary.ourPrice = comparisons[0].ourPrice;
      }

      return summary;
    } catch (error) {
      throw new Error(`Failed to get price comparison: ${error.message}`);
    }
  }

  static async generatePricingRecommendations(sku) {
    try {
      const comparisons = await CompetitorPrice.find({ sku });
      const recommendations = [];

      for (const comp of comparisons) {
        if (comp.priceStatus === 'HIGHER' && comp.pricePercentageDifference > 10) {
          recommendations.push({
            competitor: comp.competitorName,
            action: 'REDUCE_PRICE',
            suggestedPrice: comp.competitorPrice * 0.95,
            reason: `We are ${comp.pricePercentageDifference.toFixed(1)}% higher than ${comp.competitorName}`,
          });
        } else if (comp.priceStatus === 'LOWER' && comp.pricePercentageDifference < -15) {
          recommendations.push({
            competitor: comp.competitorName,
            action: 'INCREASE_PRICE',
            suggestedPrice: comp.competitorPrice * 0.98,
            reason: `We are ${Math.abs(comp.pricePercentageDifference).toFixed(1)}% cheaper - opportunity to increase`,
          });
        }
      }

      return recommendations;
    } catch (error) {
      throw new Error(`Failed to generate recommendations: ${error.message}`);
    }
  }

  static async getCompetitiveAnalysis(sku) {
    try {
      const tracking = await CompetitorPrice.find({ sku });
      const analysis = {
        sku,
        competitivePosition: 'NEUTRAL',
        pricePoints: [],
        marketShare: {},
      };

      let higherCount = 0;
      let lowerCount = 0;

      for (const t of tracking) {
        analysis.pricePoints.push({
          competitor: t.competitorName,
          price: t.competitorPrice,
          difference: t.priceDifference,
          status: t.priceStatus,
        });

        if (t.priceStatus === 'HIGHER') higherCount++;
        if (t.priceStatus === 'LOWER') lowerCount++;
      }

      if (higherCount > lowerCount) {
        analysis.competitivePosition = 'PREMIUM';
      } else if (lowerCount > higherCount) {
        analysis.competitivePosition = 'VALUE';
      }

      return analysis;
    } catch (error) {
      throw new Error(`Failed to get competitive analysis: ${error.message}`);
    }
  }

  static async getAllCompetitorPrices() {
    try {
      return await CompetitorPrice.find({}).sort({ lastUpdated: -1 });
    } catch (error) {
      throw new Error(`Failed to get all competitor prices: ${error.message}`);
    }
  }

  static async getCompetitorsByStatus(status) {
    try {
      return await CompetitorPrice.find({ priceStatus: status });
    } catch (error) {
      throw new Error(`Failed to get competitors by status: ${error.message}`);
    }
  }
}

module.exports = CompetitorService;
