const TaxRule = require('../models/TaxRule');
const CommissionSlab = require('../models/CommissionSlab');
const PayoutSchedule = require('../models/PayoutSchedule');
const RefundPolicy = require('../models/RefundPolicy');
const ReconciliationRule = require('../models/ReconciliationRule');
const PaymentTerm = require('../models/PaymentTerm');
const FinancialLimit = require('../models/FinancialLimit');
const FinancialYearConfig = require('../models/FinancialYearConfig');
const InvoiceSettingsConfig = require('../models/InvoiceSettingsConfig');
const logger = require('../../utils/logger');

function toApiId(doc) {
  if (!doc) return doc;
  const d = doc.toObject ? doc.toObject() : { ...doc };
  if (d._id) {
    d.id = d._id.toString();
    delete d._id;
  }
  return d;
}

function mapArray(arr) {
  return (arr || []).map((d) => toApiId(d));
}

class FinanceService {
  async getTaxRules() {
    try {
      const rules = await TaxRule.find().lean().sort({ createdAt: -1 });
      return mapArray(rules);
    } catch (error) {
      logger.error('Error fetching tax rules:', error);
      throw error;
    }
  }

  async createTaxRule(data) {
    try {
      const rule = new TaxRule({
        ...data,
        isActive: data.isActive ?? true,
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
      });
      await rule.save();
      return toApiId(rule);
    } catch (error) {
      logger.error('Error creating tax rule:', error);
      throw error;
    }
  }

  async updateTaxRule(ruleId, data) {
    try {
      const updateData = { ...data };
      if (data.effectiveFrom) updateData.effectiveFrom = new Date(data.effectiveFrom);
      const rule = await TaxRule.findByIdAndUpdate(
        ruleId,
        { $set: updateData },
        { new: true, runValidators: true }
      ).lean();
      return rule ? toApiId(rule) : null;
    } catch (error) {
      logger.error('Error updating tax rule:', error);
      throw error;
    }
  }

  async getCommissionSlabs() {
    try {
      const slabs = await CommissionSlab.find().lean().sort({ createdAt: -1 });
      return mapArray(slabs);
    } catch (error) {
      logger.error('Error fetching commission slabs:', error);
      throw error;
    }
  }

  async createCommissionSlab(data) {
    try {
      const slab = new CommissionSlab({
        ...data,
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
      });
      await slab.save();
      return toApiId(slab);
    } catch (error) {
      logger.error('Error creating commission slab:', error);
      throw error;
    }
  }

  async updateCommissionSlab(slabId, data) {
    try {
      const updateData = { ...data };
      if (data.effectiveFrom) updateData.effectiveFrom = new Date(data.effectiveFrom);
      const slab = await CommissionSlab.findByIdAndUpdate(
        slabId,
        { $set: updateData },
        { new: true, runValidators: true }
      ).lean();
      return slab ? toApiId(slab) : null;
    } catch (error) {
      logger.error('Error updating commission slab:', error);
      throw error;
    }
  }

  async getPayoutSchedules() {
    try {
      const schedules = await PayoutSchedule.find().lean().sort({ createdAt: -1 });
      return mapArray(schedules);
    } catch (error) {
      logger.error('Error fetching payout schedules:', error);
      throw error;
    }
  }

  async createPayoutSchedule(data) {
    try {
      const schedule = new PayoutSchedule(data);
      await schedule.save();
      return toApiId(schedule);
    } catch (error) {
      logger.error('Error creating payout schedule:', error);
      throw error;
    }
  }

  async updatePayoutSchedule(scheduleId, data) {
    try {
      const schedule = await PayoutSchedule.findByIdAndUpdate(
        scheduleId,
        { $set: data },
        { new: true, runValidators: true }
      ).lean();
      return schedule ? toApiId(schedule) : null;
    } catch (error) {
      logger.error('Error updating payout schedule:', error);
      throw error;
    }
  }

  async getRefundPolicies() {
    try {
      const policies = await RefundPolicy.find().lean().sort({ createdAt: -1 });
      return mapArray(policies);
    } catch (error) {
      logger.error('Error fetching refund policies:', error);
      throw error;
    }
  }

  async updateRefundPolicy(policyId, data) {
    try {
      const policy = await RefundPolicy.findByIdAndUpdate(
        policyId,
        { $set: data },
        { new: true, runValidators: true }
      ).lean();
      return policy ? toApiId(policy) : null;
    } catch (error) {
      logger.error('Error updating refund policy:', error);
      throw error;
    }
  }

  async getReconciliationRules() {
    try {
      const rules = await ReconciliationRule.find().lean().sort({ createdAt: -1 });
      return mapArray(rules);
    } catch (error) {
      logger.error('Error fetching reconciliation rules:', error);
      throw error;
    }
  }

  async createReconciliationRule(data) {
    try {
      const rule = new ReconciliationRule(data);
      await rule.save();
      return toApiId(rule);
    } catch (error) {
      logger.error('Error creating reconciliation rule:', error);
      throw error;
    }
  }

  async updateReconciliationRule(ruleId, data) {
    try {
      const rule = await ReconciliationRule.findByIdAndUpdate(
        ruleId,
        { $set: data },
        { new: true, runValidators: true }
      ).lean();
      return rule ? toApiId(rule) : null;
    } catch (error) {
      logger.error('Error updating reconciliation rule:', error);
      throw error;
    }
  }

  async getInvoiceSettings() {
    try {
      const settings = await InvoiceSettingsConfig.getConfig();
      const s = settings ? toApiId(settings) : null;
      if (s) delete s.key;
      return s;
    } catch (error) {
      logger.error('Error fetching invoice settings:', error);
      throw error;
    }
  }

  async updateInvoiceSettings(data) {
    try {
      const settings = await InvoiceSettingsConfig.updateConfig(data);
      const s = settings ? toApiId(settings) : null;
      if (s) delete s.key;
      return s;
    } catch (error) {
      logger.error('Error updating invoice settings:', error);
      throw error;
    }
  }

  async getPaymentTerms() {
    try {
      const terms = await PaymentTerm.find().lean().sort({ createdAt: -1 });
      return mapArray(terms);
    } catch (error) {
      logger.error('Error fetching payment terms:', error);
      throw error;
    }
  }

  async createPaymentTerm(data) {
    try {
      const term = new PaymentTerm(data);
      await term.save();
      return toApiId(term);
    } catch (error) {
      logger.error('Error creating payment term:', error);
      throw error;
    }
  }

  async updatePaymentTerm(termId, data) {
    try {
      const term = await PaymentTerm.findByIdAndUpdate(
        termId,
        { $set: data },
        { new: true, runValidators: true }
      ).lean();
      return term ? toApiId(term) : null;
    } catch (error) {
      logger.error('Error updating payment term:', error);
      throw error;
    }
  }

  async getFinancialLimits() {
    try {
      const limits = await FinancialLimit.find().lean().sort({ createdAt: -1 });
      return mapArray(limits);
    } catch (error) {
      logger.error('Error fetching financial limits:', error);
      throw error;
    }
  }

  async updateFinancialLimit(limitId, data) {
    try {
      const limit = await FinancialLimit.findByIdAndUpdate(
        limitId,
        { $set: data },
        { new: true, runValidators: true }
      ).lean();
      return limit ? toApiId(limit) : null;
    } catch (error) {
      logger.error('Error updating financial limit:', error);
      throw error;
    }
  }

  async getFinancialYear() {
    try {
      const year = await FinancialYearConfig.getConfig();
      const y = year ? toApiId(year) : null;
      if (y) delete y.key;
      return y;
    } catch (error) {
      logger.error('Error fetching financial year:', error);
      throw error;
    }
  }

  async updateFinancialYear(data) {
    try {
      const year = await FinancialYearConfig.updateConfig(data);
      const y = year ? toApiId(year) : null;
      if (y) delete y.key;
      return y;
    } catch (error) {
      logger.error('Error updating financial year:', error);
      throw error;
    }
  }
}

module.exports = new FinanceService();
