const ApprovalRequest = require('../../common-models/ApprovalRequest');
const AuditLog = require('../../common-models/AuditLog');
const websocketService = require('../../utils/websocket');
const logger = require('../../core/utils/logger');

/**
 * Workflow Automation Service
 * Handles rule-based automation and workflow triggers
 */
class WorkflowAutomationService {
  /**
   * Create automation rule
   * @param {Object} rule - Rule configuration
   */
  async createRule(rule) {
    try {
      // In a real implementation, save to AutomationRule collection
      // For now, we'll use a simple in-memory store
      const ruleId = `RULE-${Date.now()}`;
      
      logger.info(`Automation rule created: ${ruleId}`, rule);

      return {
        id: ruleId,
        ...rule,
        created_at: new Date().toISOString(),
        status: 'active',
      };
    } catch (error) {
      logger.error('Error creating automation rule:', error);
      throw error;
    }
  }

  /**
   * Trigger automation based on event
   * @param {string} eventType - Event type (order.created, inventory.low, etc.)
   * @param {Object} eventData - Event data
   */
  async triggerAutomation(eventType, eventData) {
    try {
      // In a real implementation, fetch matching rules from database
      // For now, we'll use predefined rules
      const rules = this.getMatchingRules(eventType);

      const results = [];

      for (const rule of rules) {
        try {
          // Check if rule conditions are met
          if (this.evaluateConditions(rule.conditions, eventData)) {
            // Execute rule actions
            const result = await this.executeActions(rule.actions, eventData);
            results.push({
              rule_id: rule.id,
              success: true,
              result,
            });

            // Broadcast automation event
            websocketService.broadcast('automation:triggered', {
              rule_id: rule.id,
              event_type: eventType,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (error) {
          results.push({
            rule_id: rule.id,
            success: false,
            error: error.message,
          });
        }
      }

      return results;
    } catch (error) {
      logger.error('Error triggering automation:', error);
      throw error;
    }
  }

  /**
   * Get matching rules for event type
   * @param {string} eventType - Event type
   */
  getMatchingRules(eventType) {
    // In a real implementation, query database
    // For now, return sample rules
    const sampleRules = [
      {
        id: 'RULE-001',
        name: 'Auto-approve low-value orders',
        event_type: 'order.created',
        conditions: {
          total_amount: { $lt: 1000 },
        },
        actions: [
          {
            type: 'approve',
            target: 'order',
          },
        ],
      },
      {
        id: 'RULE-002',
        name: 'Alert on low inventory',
        event_type: 'inventory.low',
        conditions: {
          quantity: { $lt: 10 },
        },
        actions: [
          {
            type: 'create_alert',
            severity: 'high',
          },
          {
            type: 'notify',
            recipients: ['warehouse_manager'],
          },
        ],
      },
    ];

    return sampleRules.filter((rule) => rule.event_type === eventType);
  }

  /**
   * Evaluate rule conditions
   * @param {Object} conditions - Conditions to evaluate
   * @param {Object} eventData - Event data
   */
  evaluateConditions(conditions, eventData) {
    for (const [key, condition] of Object.entries(conditions)) {
      const value = eventData[key];

      if (condition.$lt && value >= condition.$lt) {
        return false;
      }
      if (condition.$gt && value <= condition.$gt) {
        return false;
      }
      if (condition.$eq && value !== condition.$eq) {
        return false;
      }
      if (condition.$in && !condition.$in.includes(value)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Execute rule actions
   * @param {Array} actions - Actions to execute
   * @param {Object} eventData - Event data
   */
  async executeActions(actions, eventData) {
    const results = [];

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'approve':
            // Auto-approve
            if (eventData.order_id) {
              await ApprovalRequest.findOneAndUpdate(
                { order_id: eventData.order_id },
                { status: 'approved', auto_approved: true }
              );
            }
            results.push({ action: 'approve', success: true });
            break;

          case 'create_alert':
            // Create alert
            logger.info('Creating alert:', action.severity);
            results.push({ action: 'create_alert', success: true });
            break;

          case 'notify':
            // Send notification
            websocketService.broadcastToRole(
              action.recipients[0],
              'notification',
              {
                message: `Automated notification: ${action.message || 'Event triggered'}`,
                event_data: eventData,
              }
            );
            results.push({ action: 'notify', success: true });
            break;

          case 'update_status':
            // Update status
            logger.info('Updating status:', action.status);
            results.push({ action: 'update_status', success: true });
            break;

          default:
            logger.warn('Unknown action type:', action.type);
        }
      } catch (error) {
        results.push({ action: action.type, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Schedule automation task
   * @param {Object} task - Task configuration
   */
  async scheduleTask(task) {
    try {
      // In a real implementation, use a job scheduler (e.g., node-cron, bull)
      const taskId = `TASK-${Date.now()}`;
      
      logger.info(`Task scheduled: ${taskId}`, task);

      return {
        id: taskId,
        ...task,
        scheduled_at: new Date().toISOString(),
        status: 'scheduled',
      };
    } catch (error) {
      logger.error('Error scheduling task:', error);
      throw error;
    }
  }
}

module.exports = new WorkflowAutomationService();
