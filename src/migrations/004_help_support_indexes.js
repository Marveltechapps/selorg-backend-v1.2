/**
 * Help & Support indexes for FAQ feedback uniqueness and ticket lookups.
 */
const logger = require('../core/utils/logger');

module.exports = {
  name: '004_help_support_indexes',

  async migrate(db) {
    const results = {};

    try {
      await db.collection('customer_faq_feedback').createIndex(
        { faqId: 1, userId: 1 },
        { unique: true, name: 'faqId_1_userId_1' }
      );
      results.faqFeedback = 'ok';
    } catch (err) {
      results.faqFeedback = err.code === 85 || err.codeName === 'IndexOptionsConflict'
        ? 'exists'
        : err.message;
      logger.warn('[004_help_support_indexes] faq feedback index', { error: err.message });
    }

    try {
      await db.collection('customer_faq_items').createIndex(
        { category: 1, isActive: 1, order: 1 },
        { name: 'category_1_isActive_1_order_1' }
      );
      results.faqItems = 'ok';
    } catch (err) {
      results.faqItems = err.message;
    }

    try {
      await db.collection('adminsupporttickets').createIndex(
        { customerId: 1, channel: 1, status: 1, updatedAt: -1 },
        { name: 'customerId_1_channel_1_status_1_updatedAt_-1' }
      );
      results.supportTickets = 'ok';
    } catch (err) {
      results.supportTickets = err.message;
    }

    return results;
  },

  async rollback(db) {
    const drop = async (coll, name) => {
      try {
        await db.collection(coll).dropIndex(name);
        return 'dropped';
      } catch (err) {
        return err.message;
      }
    };
    return {
      faqFeedback: await drop('customer_faq_feedback', 'faqId_1_userId_1'),
      faqItems: await drop('customer_faq_items', 'category_1_isActive_1_order_1'),
      supportTickets: await drop(
        'adminsupporttickets',
        'customerId_1_channel_1_status_1_updatedAt_-1'
      ),
    };
  },
};
