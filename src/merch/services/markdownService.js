const MarkdownPolicy = require('../models/MarkdownPolicy');
const { generateId } = require('../../utils/idGenerator');

class MarkdownService {
  static async createMarkdownPolicy(data) {
    try {
      const markdownId = `MD-${generateId()}`;
      const policy = new MarkdownPolicy({
        ...data,
        markdownId,
      });
      await policy.save();
      return policy;
    } catch (error) {
      throw new Error(`Failed to create markdown policy: ${error.message}`);
    }
  }

  static async getMarkdownPolicy(markdownId) {
    try {
      return await MarkdownPolicy.findOne({ markdownId });
    } catch (error) {
      throw new Error(`Failed to get markdown policy: ${error.message}`);
    }
  }

  static async calculateNextMarkdown(markdownId) {
    try {
      const policy = await MarkdownPolicy.findOne({ markdownId });
      if (!policy) throw new Error('Markdown policy not found');

      const schedule = policy.markdownSchedule;
      const currentWeek = Math.floor((Date.now() - policy.timeline.startDate) / (7 * 24 * 60 * 60 * 1000));
      const nextMarkdown = schedule.find(m => m.week > currentWeek);

      return nextMarkdown || schedule[schedule.length - 1];
    } catch (error) {
      throw new Error(`Failed to calculate next markdown: ${error.message}`);
    }
  }

  static async recordMarkdownSale(markdownId, unitsSold, revenue) {
    try {
      const policy = await MarkdownPolicy.findOne({ markdownId });
      if (!policy) throw new Error('Markdown policy not found');

      const newUnits = policy.performance.unitsSold + unitsSold;
      const newRevenue = policy.performance.revenueGenerated + revenue;
      const lossAmount = (policy.originalPrice - (revenue / Math.max(unitsSold, 1))) * newUnits;

      return await MarkdownPolicy.findOneAndUpdate(
        { markdownId },
        {
          'performance.unitsSold': newUnits,
          'performance.revenueGenerated': newRevenue,
          'performance.lossAmount': lossAmount,
          updatedAt: new Date(),
        },
        { new: true }
      );
    } catch (error) {
      throw new Error(`Failed to record markdown sale: ${error.message}`);
    }
  }

  static async completeMarkdown(markdownId) {
    try {
      const policy = await MarkdownPolicy.findOne({ markdownId });
      if (!policy) throw new Error('Markdown policy not found');

      const clearancePercentage = (policy.performance.unitsSold / 
        (policy.skus.length * 100)) * 100; // Simplified

      return await MarkdownPolicy.findOneAndUpdate(
        { markdownId },
        {
          status: 'COMPLETED',
          'timeline.completionDate': new Date(),
          'performance.actualClearancePercentage': clearancePercentage,
          updatedAt: new Date(),
        },
        { new: true }
      );
    } catch (error) {
      throw new Error(`Failed to complete markdown: ${error.message}`);
    }
  }

  static async getActiveMarkdowns() {
    try {
      return await MarkdownPolicy.find({ status: 'ACTIVE' });
    } catch (error) {
      throw new Error(`Failed to get active markdowns: ${error.message}`);
    }
  }

  static async calculateMarkdownMetrics(markdownId) {
    try {
      const policy = await MarkdownPolicy.findOne({ markdownId });
      if (!policy) throw new Error('Markdown policy not found');

      const totalCost = policy.originalPrice * policy.performance.unitsSold;
      const loss = totalCost - policy.performance.revenueGenerated;
      const lossPercentage = (loss / totalCost) * 100;

      return {
        markdownId,
        unitsSold: policy.performance.unitsSold,
        revenue: policy.performance.revenueGenerated,
        totalCost,
        loss,
        lossPercentage,
        clearancePercentage: policy.performance.actualClearancePercentage,
      };
    } catch (error) {
      throw new Error(`Failed to calculate markdown metrics: ${error.message}`);
    }
  }

  static async getAllMarkdowns() {
    try {
      return await MarkdownPolicy.find({}).sort({ createdAt: -1 });
    } catch (error) {
      throw new Error(`Failed to get all markdowns: ${error.message}`);
    }
  }

  static async pauseMarkdown(markdownId) {
    try {
      return await MarkdownPolicy.findOneAndUpdate(
        { markdownId },
        { status: 'PAUSED', updatedAt: new Date() },
        { new: true }
      );
    } catch (error) {
      throw new Error(`Failed to pause markdown: ${error.message}`);
    }
  }
}

module.exports = MarkdownService;
