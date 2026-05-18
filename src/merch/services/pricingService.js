const DynamicPrice = require('../models/DynamicPrice');
const PricingRule = require('../models/PricingRule');
const CompetitorPrice = require('../models/CompetitorPrice');
const { generateId } = require('../../utils/idGenerator');

class PricingService {
  static async calculateDynamicPrice(sku, factors) {
    try {
      const rules = await PricingRule.find({ 
        applicableSKUs: { $in: [sku, '*'] },
        isActive: true 
      }).sort({ priority: 1 });

      let calculatedPrice = factors.basePrice;
      let appliedRules = [];

      for (const rule of rules) {
        if (this.evaluateRuleConditions(rule, factors)) {
          calculatedPrice = this.applyPricingStrategy(calculatedPrice, rule, factors);
          appliedRules.push(rule.ruleId);
          break; // Use first matching rule
        }
      }

      // Apply constraints
      if (calculatedPrice < factors.minPrice) calculatedPrice = factors.minPrice;
      if (calculatedPrice > factors.maxPrice) calculatedPrice = factors.maxPrice;

      const priceId = `PRICE-${generateId()}`;
      const dynamicPrice = new DynamicPrice({
        priceId,
        sku,
        basePrice: factors.basePrice,
        currentPrice: calculatedPrice,
        pricingFactors: factors,
        lastCalculatedAt: new Date(),
        nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      await dynamicPrice.save();
      return dynamicPrice;
    } catch (error) {
      throw new Error(`Failed to calculate dynamic price: ${error.message}`);
    }
  }

  static evaluateRuleConditions(rule, factors) {
    // Simplified condition evaluation
    if (rule.pricingStrategy === 'DYNAMIC') {
      return factors.demandLevel === 'HIGH' || factors.demandLevel === 'CRITICAL';
    }
    return true;
  }

  static applyPricingStrategy(basePrice, rule, factors) {
    switch (rule.pricingStrategy) {
      case 'FIXED':
        return rule.basePrice;
      case 'PERCENTAGE':
        return basePrice * (1 + rule.adjustmentRules[0]?.adjustmentValue / 100);
      case 'MARGIN_BASED':
        return basePrice / (1 - rule.marginTarget / 100);
      case 'COST_PLUS':
        return basePrice * (1 + rule.adjustmentRules[0]?.adjustmentValue / 100);
      case 'DYNAMIC':
        // Complex dynamic pricing
        const demandMultiplier = factors.demandLevel === 'CRITICAL' ? 1.3 : 
                                 factors.demandLevel === 'HIGH' ? 1.15 : 1.0;
        const inventoryMultiplier = factors.inventoryLevel > 1000 ? 0.95 : 1.0;
        return basePrice * demandMultiplier * inventoryMultiplier;
      default:
        return basePrice;
    }
  }

  static async optimizePricing(sku) {
    try {
      const competitor = await CompetitorPrice.findOne({ sku });
      const dynamicPrice = await DynamicPrice.findOne({ sku });

      if (!dynamicPrice) {
        throw new Error('Dynamic price record not found');
      }

      let optimizedPrice = dynamicPrice.currentPrice;
      let optimizationScore = 50;

      // Optimization logic
      if (competitor) {
        const priceDifference = (dynamicPrice.currentPrice - competitor.competitorPrice) / competitor.competitorPrice * 100;
        
        if (priceDifference > 10) {
          // We're significantly more expensive
          optimizedPrice *= 0.95;
          optimizationScore += 15;
        } else if (priceDifference < -10) {
          // We're significantly cheaper - opportunity to increase
          optimizedPrice *= 1.05;
          optimizationScore += 20;
        }
      }

      dynamicPrice.currentPrice = Math.round(optimizedPrice * 100) / 100;
      dynamicPrice.isOptimized = true;
      dynamicPrice.optimizationScore = optimizationScore;
      await dynamicPrice.save();

      return dynamicPrice;
    } catch (error) {
      throw new Error(`Failed to optimize pricing: ${error.message}`);
    }
  }

  static async getPriceHistory(sku, daysBack = 30) {
    try {
      const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
      const priceRecords = await DynamicPrice.find({
        sku,
        createdAt: { $gte: cutoffDate }
      }).sort({ createdAt: -1 });

      return priceRecords;
    } catch (error) {
      throw new Error(`Failed to get price history: ${error.message}`);
    }
  }

  static async updatePriceRule(ruleId, updates) {
    try {
      const rule = await PricingRule.findOneAndUpdate(
        { ruleId },
        { ...updates, updatedAt: new Date() },
        { new: true }
      );
      return rule;
    } catch (error) {
      throw new Error(`Failed to update price rule: ${error.message}`);
    }
  }

  static async createPricingRule(data) {
    try {
      const ruleId = `RULE-${generateId()}`;
      const rule = new PricingRule({
        ...data,
        ruleId,
      });
      await rule.save();
      return rule;
    } catch (error) {
      throw new Error(`Failed to create pricing rule: ${error.message}`);
    }
  }

  static async getAllPricingRules() {
    try {
      return await PricingRule.find({ isActive: true }).sort({ priority: 1 });
    } catch (error) {
      throw new Error(`Failed to get pricing rules: ${error.message}`);
    }
  }

  static async calculateBulkPricing(skus) {
    try {
      const results = [];
      for (const sku of skus) {
        const factors = {
          basePrice: 100,
          minPrice: 50,
          maxPrice: 150,
          demandLevel: 'MEDIUM',
          inventoryLevel: 500,
        };
        const price = await this.calculateDynamicPrice(sku, factors);
        results.push(price);
      }
      return results;
    } catch (error) {
      throw new Error(`Failed to calculate bulk pricing: ${error.message}`);
    }
  }
}

module.exports = PricingService;
