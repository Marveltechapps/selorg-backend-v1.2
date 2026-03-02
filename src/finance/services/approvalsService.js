const ApprovalTask = require('../models/ApprovalTask');
const logger = require('../../utils/logger');

class ApprovalsService {
  async getApprovalSummary() {
    try {
      const pending = await ApprovalTask.find({ status: 'pending' }).lean();

      const refundRequestsCount = pending.filter(t => t.type === 'refund').length;
      const invoiceApprovalsCount = pending.filter(t => t.type === 'invoice').length;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const approvedToday = await ApprovalTask.countDocuments({
        status: 'approved',
        approvedAt: { $gte: today, $lt: tomorrow },
      });

      return {
        refundRequestsCount,
        invoiceApprovalsCount,
        approvedTodayCount: approvedToday,
      };
    } catch (error) {
      logger.error('Error fetching approval summary:', error);
      throw error;
    }
  }

  async getApprovalTasks(status = 'pending', type, minAmount) {
    try {
      const query = { status };

      if (type && type !== 'all') {
        query.type = type;
      }

      if (minAmount) {
        query.amount = { $gte: minAmount };
      }

      const tasks = await ApprovalTask.find(query)
        .sort({ createdAt: -1 })
        .lean();

      return tasks.map(task => ({
        id: task._id.toString(),
        ...task,
      }));
    } catch (error) {
      logger.error('Error fetching approval tasks:', error);
      throw error;
    }
  }

  async getTaskDetails(id) {
    try {
      const task = await ApprovalTask.findById(id).lean();
      if (!task) {
        return null;
      }
      return {
        id: task._id.toString(),
        ...task,
      };
    } catch (error) {
      logger.error('Error fetching task details:', error);
      throw error;
    }
  }

  async submitTaskDecision(id, payload) {
    try {
      const task = await ApprovalTask.findById(id);
      if (!task) {
        throw new Error('Task not found');
      }

      task.status = payload.decision === 'approve' ? 'approved' : 'rejected';
      task.notes = payload.note;
      task.approvedAt = new Date();
      task.approverName = 'Current User'; // Should come from auth context
      await task.save();

      return {
        id: task._id.toString(),
        ...task.toObject(),
      };
    } catch (error) {
      logger.error('Error submitting task decision:', error);
      throw error;
    }
  }
}

module.exports = new ApprovalsService();

