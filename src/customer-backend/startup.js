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
      const customerLegalOr = { $or: [{ appTarget: 'customer' }, { appTarget: { $exists: false } }] };
      const termsCount = await LegalDocument.countDocuments({ type: 'terms', ...customerLegalOr });
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
          appTarget: 'customer',
        });
        logger.info('Customer legal: seeded default terms document');
      }
      const privacyCount = await LegalDocument.countDocuments({ type: 'privacy', ...customerLegalOr });
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
          appTarget: 'customer',
        });
        logger.info('Customer legal: seeded default privacy document');
      }

      const riderConfigCount = await LegalConfig.countDocuments({ key: 'rider_login_legal' });
      if (riderConfigCount === 0) {
        await LegalConfig.create({
          key: 'rider_login_legal',
          loginLegal: {
            preamble: 'By continuing, you agree to our ',
            terms: { label: 'Terms & Conditions', type: 'in_app', url: null },
            privacy: { label: 'Privacy Policy', type: 'in_app', url: null },
            connector: ' and ',
          },
        });
        logger.info('Rider legal: seeded default login legal config');
      }
      const riderTermsCount = await LegalDocument.countDocuments({ type: 'terms', appTarget: 'rider' });
      if (riderTermsCount === 0) {
        await LegalDocument.create({
          type: 'terms',
          version: '1',
          title: 'Terms & Conditions',
          effectiveDate: new Date().toISOString().slice(0, 10),
          lastUpdated: new Date().toISOString().slice(0, 10),
          contentFormat: 'plain',
          content:
            'Welcome to SelOrg QuickRider. By registering as a delivery partner, you agree to these Terms & Conditions. ' +
            'You must be at least 18 years old, hold valid ID and driving license, and maintain valid vehicle registration and insurance. ' +
            'You are an independent contractor and may accept or decline delivery requests at your discretion. ' +
            'Earnings are based on completed deliveries; payments are processed per the payout schedule in the app.',
          isCurrent: true,
          appTarget: 'rider',
        });
        logger.info('Rider legal: seeded default terms document');
      }
      const riderPrivacyCount = await LegalDocument.countDocuments({ type: 'privacy', appTarget: 'rider' });
      if (riderPrivacyCount === 0) {
        await LegalDocument.create({
          type: 'privacy',
          version: '1',
          title: 'Privacy Policy',
          effectiveDate: new Date().toISOString().slice(0, 10),
          lastUpdated: new Date().toISOString().slice(0, 10),
          contentFormat: 'plain',
          content:
            'SelOrg collects personal details, identity and vehicle documents, location data during active deliveries, ' +
            'and payment information to verify eligibility, assign orders, process payouts, and comply with law. ' +
            'We do not sell your personal information. Contact support through the app for access or deletion requests.',
          isCurrent: true,
          appTarget: 'rider',
        });
        logger.info('Rider legal: seeded default privacy document');
      }
    } catch (err) {
      logger.warn('Customer legal seed failed', { error: err.message });
    }
  })();
}

module.exports = { run };
