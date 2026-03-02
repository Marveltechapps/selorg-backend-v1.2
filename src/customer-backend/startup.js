/**
 * Customer-backend startup: run after DB is connected (e.g. partial unique index on customer_users.email).
 * Registered on mongoose connection 'connected' so it runs once when the shared DB is ready.
 */
const mongoose = require('mongoose');
const logger = require('../core/utils/logger');
const { LegalConfig } = require('./models/LegalConfig');
const { LegalDocument } = require('./models/LegalDocument');

function run() {
  const conn = mongoose.connection;
  if (conn.readyState !== 1) {
    conn.once('connected', run);
    return;
  }
  (async () => {
    try {
      const coll = conn.collection('customer_users');
      try {
        await coll.dropIndex('email_1');
        logger.info('Dropped legacy email_1 index on customer_users');
      } catch (e) {
        // ignore if not present
      }
    } catch (err) {
      logger.warn('Customer startup index cleanup failed', { error: err.message });
    }

    try {
      const configCount = await LegalConfig.countDocuments({ key: 'login_legal' });
      if (configCount === 0) {
        await LegalConfig.create({
          key: 'login_legal',
          loginLegal: {
            preamble: 'By continuing, you agree to our ',
            terms: { label: 'Terms of Service', type: 'in_app', url: null },
            privacy: { label: 'Privacy Policy', type: 'in_app', url: null },
            connector: ' and ',
          },
        });
        logger.info('Customer legal: seeded default login legal config');
      }
      const termsCount = await LegalDocument.countDocuments({ type: 'terms' });
      if (termsCount === 0) {
        await LegalDocument.create({
          type: 'terms',
          version: '1',
          title: 'Terms of Service',
          effectiveDate: '2024-01-15',
          lastUpdated: '2024-01-15',
          contentFormat: 'plain',
          content: 'Terms of Service content is managed by the backend. Please configure via admin or database.',
          isCurrent: true,
        });
        logger.info('Customer legal: seeded default terms document');
      }
      const privacyCount = await LegalDocument.countDocuments({ type: 'privacy' });
      if (privacyCount === 0) {
        await LegalDocument.create({
          type: 'privacy',
          version: '1',
          title: 'Privacy Policy',
          effectiveDate: '2024-01-15',
          lastUpdated: '2024-01-15',
          contentFormat: 'plain',
          content: 'Privacy Policy content is managed by the backend. Please configure via admin or database.',
          isCurrent: true,
        });
        logger.info('Customer legal: seeded default privacy document');
      }
    } catch (err) {
      logger.warn('Customer legal seed failed', { error: err.message });
    }
  })();
}

module.exports = { run };
