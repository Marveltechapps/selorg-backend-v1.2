const PromotionCampaign = require('../models/PromotionCampaign');
const { generateId } = require('../../utils/idGenerator');

class PromotionService {
  static async createCampaign(data) {
    try {
      const campaignId = `CAMP-${generateId()}`;
      const campaign = new PromotionCampaign({
        ...data,
        campaignId,
      });
      await campaign.save();
      return campaign;
    } catch (error) {
      throw new Error(`Failed to create campaign: ${error.message}`);
    }
  }

  static async getCampaign(campaignId) {
    try {
      return await PromotionCampaign.findOne({ campaignId });
    } catch (error) {
      throw new Error(`Failed to get campaign: ${error.message}`);
    }
  }

  static async approveCampaign(campaignId, approver, comments = '') {
    try {
      const campaign = await PromotionCampaign.findOneAndUpdate(
        { campaignId },
        {
          status: 'SCHEDULED',
          approvedBy: approver,
          $push: {
            approvals: {
              approver,
              approvalDate: new Date(),
              comments,
            },
          },
          updatedAt: new Date(),
        },
        { new: true }
      );
      return campaign;
    } catch (error) {
      throw new Error(`Failed to approve campaign: ${error.message}`);
    }
  }

  static async launchCampaign(campaignId) {
    try {
      const campaign = await PromotionCampaign.findOneAndUpdate(
        { campaignId },
        {
          status: 'ACTIVE',
          'timeline.launchDate': new Date(),
          updatedAt: new Date(),
        },
        { new: true }
      );
      return campaign;
    } catch (error) {
      throw new Error(`Failed to launch campaign: ${error.message}`);
    }
  }

  static async pauseCampaign(campaignId) {
    try {
      return await PromotionCampaign.findOneAndUpdate(
        { campaignId },
        {
          status: 'PAUSED',
          updatedAt: new Date(),
        },
        { new: true }
      );
    } catch (error) {
      throw new Error(`Failed to pause campaign: ${error.message}`);
    }
  }

  static async completeCampaign(campaignId) {
    try {
      const campaign = await PromotionCampaign.findOne({ campaignId });
      const roi = campaign.budget.spentBudget > 0 
        ? ((campaign.actualMetrics.actualRevenue - campaign.budget.spentBudget) / campaign.budget.spentBudget) * 100
        : 0;

      return await PromotionCampaign.findOneAndUpdate(
        { campaignId },
        {
          status: 'COMPLETED',
          'timeline.completionDate': new Date(),
          'actualMetrics.roi': roi,
          updatedAt: new Date(),
        },
        { new: true }
      );
    } catch (error) {
      throw new Error(`Failed to complete campaign: ${error.message}`);
    }
  }

  static async getActiveCampaigns() {
    try {
      return await PromotionCampaign.find({ 
        status: { $in: ['ACTIVE', 'SCHEDULED'] }
      });
    } catch (error) {
      throw new Error(`Failed to get active campaigns: ${error.message}`);
    }
  }

  static async calculateCampaignMetrics(campaignId) {
    try {
      const campaign = await PromotionCampaign.findOne({ campaignId });
      if (!campaign) throw new Error('Campaign not found');

      const remainingBudget = campaign.budget.totalBudget - campaign.budget.spentBudget;
      const roi = campaign.budget.spentBudget > 0
        ? ((campaign.actualMetrics.actualRevenue - campaign.budget.spentBudget) / campaign.budget.spentBudget) * 100
        : 0;

      const metrics = {
        campaignId,
        budgetUtilization: (campaign.budget.spentBudget / campaign.budget.totalBudget) * 100,
        roi,
        salesLift: campaign.actualMetrics.actualSalesLift,
        unitsSold: campaign.actualMetrics.actualUnits,
        revenue: campaign.actualMetrics.actualRevenue,
        remainingBudget,
      };

      return metrics;
    } catch (error) {
      throw new Error(`Failed to calculate campaign metrics: ${error.message}`);
    }
  }

  static async updateBudgetAllocation(campaignId, spentAmount) {
    try {
      const campaign = await PromotionCampaign.findOne({ campaignId });
      if (!campaign) throw new Error('Campaign not found');

      const newSpent = campaign.budget.spentBudget + spentAmount;
      const remaining = campaign.budget.totalBudget - newSpent;

      return await PromotionCampaign.findOneAndUpdate(
        { campaignId },
        {
          'budget.spentBudget': newSpent,
          'budget.remainingBudget': remaining,
          updatedAt: new Date(),
        },
        { new: true }
      );
    } catch (error) {
      throw new Error(`Failed to update budget: ${error.message}`);
    }
  }

  static async getAllCampaigns() {
    try {
      return await PromotionCampaign.find({}).sort({ 'timeline.startDate': -1 });
    } catch (error) {
      throw new Error(`Failed to get all campaigns: ${error.message}`);
    }
  }
}

module.exports = PromotionService;
