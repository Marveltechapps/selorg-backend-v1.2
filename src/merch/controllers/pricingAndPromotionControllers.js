const PricingService = require('../services/pricingService');
const PromotionService = require('../services/promotionService');
const MarkdownService = require('../services/markdownService');
const CompetitorService = require('../services/competitorService');
const { apiResponse } = require('../../utils/apiResponse');

class PricingController {
  static async calculatePrice(req, res) {
    try {
      const { sku, factors } = req.body;
      const price = await PricingService.calculateDynamicPrice(sku, factors);
      res.status(201).json(apiResponse.success(price, 'Price calculated successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async optimizePrice(req, res) {
    try {
      const { sku } = req.params;
      const price = await PricingService.optimizePricing(sku);
      res.status(200).json(apiResponse.success(price, 'Price optimized successfully'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getPriceHistory(req, res) {
    try {
      const { sku } = req.params;
      const { daysBack } = req.query;
      const history = await PricingService.getPriceHistory(sku, parseInt(daysBack) || 30);
      res.status(200).json(apiResponse.success(history, 'Price history retrieved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async createRule(req, res) {
    try {
      const rule = await PricingService.createPricingRule(req.body);
      res.status(201).json(apiResponse.success(rule, 'Pricing rule created'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getAllRules(req, res) {
    try {
      const rules = await PricingService.getAllPricingRules();
      res.status(200).json(apiResponse.success(rules, 'Rules retrieved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async updateRule(req, res) {
    try {
      const { ruleId } = req.params;
      const rule = await PricingService.updatePriceRule(ruleId, req.body);
      res.status(200).json(apiResponse.success(rule, 'Rule updated'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async calculateBulk(req, res) {
    try {
      const { skus } = req.body;
      const prices = await PricingService.calculateBulkPricing(skus);
      res.status(200).json(apiResponse.success(prices, 'Bulk pricing calculated'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }
}

class PromotionController {
  static async createCampaign(req, res) {
    try {
      const campaign = await PromotionService.createCampaign(req.body);
      res.status(201).json(apiResponse.success(campaign, 'Campaign created'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getCampaign(req, res) {
    try {
      const { campaignId } = req.params;
      const campaign = await PromotionService.getCampaign(campaignId);
      res.status(200).json(apiResponse.success(campaign, 'Campaign retrieved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async approveCampaign(req, res) {
    try {
      const { campaignId } = req.params;
      const { approver, comments } = req.body;
      const campaign = await PromotionService.approveCampaign(campaignId, approver, comments);
      res.status(200).json(apiResponse.success(campaign, 'Campaign approved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async launchCampaign(req, res) {
    try {
      const { campaignId } = req.params;
      const campaign = await PromotionService.launchCampaign(campaignId);
      res.status(200).json(apiResponse.success(campaign, 'Campaign launched'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async pauseCampaign(req, res) {
    try {
      const { campaignId } = req.params;
      const campaign = await PromotionService.pauseCampaign(campaignId);
      res.status(200).json(apiResponse.success(campaign, 'Campaign paused'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async completeCampaign(req, res) {
    try {
      const { campaignId } = req.params;
      const campaign = await PromotionService.completeCampaign(campaignId);
      res.status(200).json(apiResponse.success(campaign, 'Campaign completed'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getMetrics(req, res) {
    try {
      const { campaignId } = req.params;
      const metrics = await PromotionService.calculateCampaignMetrics(campaignId);
      res.status(200).json(apiResponse.success(metrics, 'Metrics calculated'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getAllCampaigns(req, res) {
    try {
      const campaigns = await PromotionService.getAllCampaigns();
      res.status(200).json(apiResponse.success(campaigns, 'Campaigns retrieved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }
}

class MarkdownController {
  static async createPolicy(req, res) {
    try {
      const policy = await MarkdownService.createMarkdownPolicy(req.body);
      res.status(201).json(apiResponse.success(policy, 'Markdown policy created'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getPolicy(req, res) {
    try {
      const { markdownId } = req.params;
      const policy = await MarkdownService.getMarkdownPolicy(markdownId);
      res.status(200).json(apiResponse.success(policy, 'Policy retrieved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async recordSale(req, res) {
    try {
      const { markdownId } = req.params;
      const { unitsSold, revenue } = req.body;
      const policy = await MarkdownService.recordMarkdownSale(markdownId, unitsSold, revenue);
      res.status(200).json(apiResponse.success(policy, 'Sale recorded'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getMetrics(req, res) {
    try {
      const { markdownId } = req.params;
      const metrics = await MarkdownService.calculateMarkdownMetrics(markdownId);
      res.status(200).json(apiResponse.success(metrics, 'Metrics calculated'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async completeMarkdown(req, res) {
    try {
      const { markdownId } = req.params;
      const policy = await MarkdownService.completeMarkdown(markdownId);
      res.status(200).json(apiResponse.success(policy, 'Markdown completed'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getAllMarkdowns(req, res) {
    try {
      const markdowns = await MarkdownService.getAllMarkdowns();
      res.status(200).json(apiResponse.success(markdowns, 'Markdowns retrieved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }
}

class CompetitorController {
  static async trackPrice(req, res) {
    try {
      const tracking = await CompetitorService.trackCompetitorPrice(req.body);
      res.status(201).json(apiResponse.success(tracking, 'Price tracked'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async updatePrice(req, res) {
    try {
      const { trackingId } = req.params;
      const { newPrice, newAvailability } = req.body;
      const tracking = await CompetitorService.updateCompetitorPrice(trackingId, newPrice, newAvailability);
      res.status(200).json(apiResponse.success(tracking, 'Price updated'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getComparison(req, res) {
    try {
      const { sku } = req.params;
      const comparison = await CompetitorService.getPriceComparison(sku);
      res.status(200).json(apiResponse.success(comparison, 'Comparison retrieved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getRecommendations(req, res) {
    try {
      const { sku } = req.params;
      const recommendations = await CompetitorService.generatePricingRecommendations(sku);
      res.status(200).json(apiResponse.success(recommendations, 'Recommendations generated'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getAnalysis(req, res) {
    try {
      const { sku } = req.params;
      const analysis = await CompetitorService.getCompetitiveAnalysis(sku);
      res.status(200).json(apiResponse.success(analysis, 'Analysis retrieved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }

  static async getAllPrices(req, res) {
    try {
      const prices = await CompetitorService.getAllCompetitorPrices();
      res.status(200).json(apiResponse.success(prices, 'Prices retrieved'));
    } catch (error) {
      res.status(400).json(apiResponse.error(error.message, 400));
    }
  }
}

module.exports = {
  PricingController,
  PromotionController,
  MarkdownController,
  CompetitorController,
};
