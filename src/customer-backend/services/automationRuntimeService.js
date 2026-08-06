/**
 * Runtime for admin automation rules — fires when domain events occur.
 */
const NotificationAutomation = require('../../admin/models/NotificationAutomation');
const NotificationTemplate = require('../../admin/models/NotificationTemplate');
const { sendNotification } = require('../services/unifiedNotificationService');
const { resolveCategory } = require('../constants/notificationCategories');
const { mapChannels, fillTemplateVariables } = require('../../admin/services/campaignDispatchService');
const logger = require('../../core/utils/logger');

/**
 * Trigger active automation rules for a given trigger key.
 * @param {string} trigger — e.g. order_placed, payment_failed
 * @param {object} ctx
 * @param {string|ObjectId} ctx.userId
 * @param {object} [ctx.vars] — template variables
 * @param {string} [ctx.dedupeSuffix] — unique per event for dedupe
 */
async function fireAutomation(trigger, ctx = {}) {
  const { userId, vars = {}, dedupeSuffix } = ctx;
  if (!userId || !trigger) return { fired: 0 };

  const rules = await NotificationAutomation.find({
    trigger,
    status: 'active',
  }).lean();

  if (!rules.length) return { fired: 0 };

  let fired = 0;
  for (const rule of rules) {
    const run = async () => {
      try {
        const template = await NotificationTemplate.findById(rule.templateId);
        if (!template || template.status === 'inactive') return;

        const displayName = vars.user_name || vars.name || 'Customer';
        const fillVars = { user_name: displayName, name: displayName, ...vars };
        const title = fillTemplateVariables(template.title, fillVars);
        const body = fillTemplateVariables(template.body, fillVars);
        const category = resolveCategory(template.category);
        const channels = mapChannels(rule.channels?.length ? rule.channels : template.channels);

        const result = await sendNotification({
          userId,
          title,
          body,
          type: 'CAMPAIGN',
          category,
          channels: channels.length ? channels : undefined,
          data: {
            automationId: String(rule._id),
            trigger,
            type: 'automation',
            category,
          },
          dedupeKey: dedupeSuffix
            ? `automation:${rule._id}:${dedupeSuffix}`
            : `automation:${rule._id}:${userId}:${Date.now()}`,
        });

        const success = result.success && !result.skipped;
        await NotificationAutomation.updateOne(
          { _id: rule._id },
          {
            $inc: { totalTriggered: 1 },
            $set: {
              successRate: success
                ? Math.min(100, (rule.successRate || 0) * 0.9 + 10)
                : Math.max(0, (rule.successRate || 0) * 0.9),
            },
          }
        );
        fired += 1;
      } catch (err) {
        logger.warn('Automation rule failed', {
          ruleId: String(rule._id),
          trigger,
          err: err.message,
        });
      }
    };

    const delayMs = Math.max(0, Number(rule.delay) || 0) * 1000;
    if (delayMs > 0) {
      setTimeout(() => {
        run().catch(() => {});
      }, delayMs);
    } else {
      await run();
    }
  }

  return { fired };
}

/** Map domain / status events → automation trigger keys. */
const STATUS_TO_TRIGGER = {
  pending: 'order_placed',
  confirmed: 'order_confirmed',
  'getting-packed': 'order_packed',
  'on-the-way': 'order_on_way',
  delivered: 'order_delivered',
  cancelled: 'order_cancelled',
};

async function fireForOrderStatus(order, newStatus) {
  const trigger = STATUS_TO_TRIGGER[newStatus];
  if (!trigger || !order?.userId) return;
  return fireAutomation(trigger, {
    userId: order.userId,
    vars: {
      orderNumber: order.orderNumber,
      order_number: order.orderNumber,
      name: undefined,
    },
    dedupeSuffix: `${String(order._id)}:${newStatus}`,
  });
}

async function fireForPayment(order, outcome) {
  if (!order?.userId) return;
  const trigger = outcome === 'success' ? 'payment_success' : outcome === 'failed' ? 'payment_failed' : null;
  if (!trigger) return;
  return fireAutomation(trigger, {
    userId: order.userId,
    vars: { orderNumber: order.orderNumber, order_number: order.orderNumber },
    dedupeSuffix: `${String(order._id)}:${trigger}`,
  });
}

async function fireForWallet(userId, kind, vars = {}) {
  const trigger = kind === 'credit' ? 'wallet_credit' : kind === 'debit' ? 'wallet_debit' : null;
  if (!trigger || !userId) return;
  return fireAutomation(trigger, {
    userId,
    vars,
    dedupeSuffix: `${userId}:${trigger}:${vars.amount || ''}:${Date.now()}`,
  });
}

async function fireForRefund(userId, kind, vars = {}) {
  const trigger =
    kind === 'initiated' ? 'refund_initiated' : kind === 'completed' ? 'refund_completed' : null;
  if (!trigger || !userId) return;
  return fireAutomation(trigger, {
    userId,
    vars,
    dedupeSuffix: `${userId}:${trigger}:${vars.orderId || vars.orderNumber || Date.now()}`,
  });
}

async function fireForSupportReply(userId, vars = {}) {
  if (!userId) return;
  return fireAutomation('support_reply', {
    userId,
    vars,
    dedupeSuffix: `${userId}:support:${vars.ticketId || Date.now()}`,
  });
}

async function fireForSignup(userId, vars = {}) {
  if (!userId) return;
  return fireAutomation('user_signup', {
    userId,
    vars,
    dedupeSuffix: `${userId}:signup`,
  });
}

module.exports = {
  fireAutomation,
  fireForOrderStatus,
  fireForPayment,
  fireForWallet,
  fireForRefund,
  fireForSupportReply,
  fireForSignup,
  STATUS_TO_TRIGGER,
};
