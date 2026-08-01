/**
 * Customer-backend startup: run after DB is connected (e.g. partial unique index on customer_users.email).
 * Registered on mongoose connection 'connected' so it runs once when the shared DB is ready.
 */
const mongoose = require('mongoose');
const logger = require('../core/utils/logger');
const { LegalConfig } = require('./models/LegalConfig');
const { LegalDocument } = require('./models/LegalDocument');
const {
  PLACEHOLDER_TERMS,
  PLACEHOLDER_PRIVACY,
  CUSTOMER_TERMS,
  CUSTOMER_PRIVACY,
  CUSTOMER_LICENSE,
  EFFECTIVE_DATE,
} = require('./data/legalSeedContent');

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

      const addressColl = conn.collection('customer_addresses');
      try {
        await addressColl.dropIndex('userId_1_label_1');
        logger.info('Dropped legacy userId_1_label_1 index on customer_addresses');
      } catch (e) {
        // ignore if not present or non-unique compound index replaced in schema
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
          title: 'Terms of Use',
          effectiveDate: EFFECTIVE_DATE,
          lastUpdated: EFFECTIVE_DATE,
          contentFormat: 'plain',
          content: CUSTOMER_TERMS,
          isCurrent: true,
          appTarget: 'customer',
        });
        logger.info('Customer legal: seeded default terms document');
      } else {
        await LegalDocument.updateMany(
          {
            type: 'terms',
            isCurrent: true,
            content: PLACEHOLDER_TERMS,
            ...customerLegalOr,
          },
          {
            $set: {
              title: 'Terms of Use',
              content: CUSTOMER_TERMS,
              lastUpdated: EFFECTIVE_DATE,
            },
          }
        );
      }
      const privacyCount = await LegalDocument.countDocuments({ type: 'privacy', ...customerLegalOr });
      if (privacyCount === 0) {
        await LegalDocument.create({
          type: 'privacy',
          version: '1',
          title: 'Privacy Policy',
          effectiveDate: EFFECTIVE_DATE,
          lastUpdated: EFFECTIVE_DATE,
          contentFormat: 'plain',
          content: CUSTOMER_PRIVACY,
          isCurrent: true,
          appTarget: 'customer',
        });
        logger.info('Customer legal: seeded default privacy document');
      } else {
        await LegalDocument.updateMany(
          {
            type: 'privacy',
            isCurrent: true,
            content: PLACEHOLDER_PRIVACY,
            ...customerLegalOr,
          },
          {
            $set: {
              content: CUSTOMER_PRIVACY,
              lastUpdated: EFFECTIVE_DATE,
            },
          }
        );
      }
      const licenseCount = await LegalDocument.countDocuments({ type: 'license', ...customerLegalOr });
      if (licenseCount === 0) {
        await LegalDocument.create({
          type: 'license',
          version: '1',
          title: 'License',
          effectiveDate: EFFECTIVE_DATE,
          lastUpdated: EFFECTIVE_DATE,
          contentFormat: 'plain',
          content: CUSTOMER_LICENSE,
          isCurrent: true,
          appTarget: 'customer',
        });
        logger.info('Customer legal: seeded default license document');
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

    try {
      const { FaqItem } = require('./models/FaqItem');
      const { FAQ_SEED_ITEMS } = require('./data/faqSeedContent');
      let inserted = 0;
      for (const item of FAQ_SEED_ITEMS) {
        const existing = await FaqItem.findOne({
          question: item.question,
          category: item.category,
        })
          .select('_id')
          .lean();
        if (existing) continue;
        await FaqItem.create({
          ...item,
          isActive: true,
          helpfulCount: 0,
          notHelpfulCount: 0,
        });
        inserted += 1;
      }
      if (inserted > 0) {
        logger.info(`Customer FAQ: seeded ${inserted} FAQ items`);
      }
    } catch (err) {
      logger.warn('Customer FAQ seed failed', { error: err.message });
    }

    try {
      const { AppConfig, DEFAULT_APP_CONFIG } = require('./models/AppConfig');
      const { FAQ_CATEGORIES } = require('./data/faqSeedContent');

      const isPlaceholderPhone = (value) => {
        const digits = String(value || '').replace(/\D/g, '');
        return !digits || /^91?9{8,}$/.test(digits) || /^0*9{10}$/.test(digits);
      };

      const existing = await AppConfig.findOne({ key: 'default' });
      if (existing) {
        let changed = false;
        const support = existing.support || {};
        const defaults = DEFAULT_APP_CONFIG.support || {};

        // Clear known CMS placeholder phones so apps don't show fake contact numbers
        const cleanedSupport = { ...support };
        ['contactPhone', 'supportPhone', 'whatsappNumber'].forEach((field) => {
          if (isPlaceholderPhone(cleanedSupport[field])) {
            cleanedSupport[field] = '';
            changed = true;
          }
        });

        const needsSupportPatch =
          cleanedSupport.workingHours == null ||
          cleanedSupport.responseTime == null ||
          cleanedSupport.supportEmail == null ||
          cleanedSupport.liveChatEnabled == null ||
          !cleanedSupport.contactPhone ||
          !cleanedSupport.supportPhone;
        if (needsSupportPatch || changed) {
          existing.support = {
            ...defaults,
            ...cleanedSupport,
            contactPhone:
              cleanedSupport.contactPhone ||
              cleanedSupport.supportPhone ||
              defaults.contactPhone ||
              '',
            supportPhone:
              cleanedSupport.supportPhone ||
              cleanedSupport.contactPhone ||
              defaults.supportPhone ||
              '',
            whatsappNumber:
              cleanedSupport.whatsappNumber || defaults.whatsappNumber || '',
            supportEmail:
              cleanedSupport.supportEmail ||
              cleanedSupport.contactEmail ||
              defaults.supportEmail,
            contactEmail:
              cleanedSupport.contactEmail ||
              cleanedSupport.supportEmail ||
              defaults.contactEmail,
            whatsappNumber: cleanedSupport.whatsappNumber || '',
            workingHours: cleanedSupport.workingHours || defaults.workingHours,
            responseTime: cleanedSupport.responseTime || defaults.responseTime,
            liveChatEnabled:
              typeof cleanedSupport.liveChatEnabled === 'boolean'
                ? cleanedSupport.liveChatEnabled
                : defaults.liveChatEnabled !== false,
          };
          existing.markModified('support');
          changed = true;
          logger.info('Customer AppConfig: sanitized/patched support contact fields');
        }

        const checkout = existing.checkout || {};
        const checkoutDefaults = DEFAULT_APP_CONFIG.checkout || {};
        if (!Array.isArray(checkout.cancelReasons) || checkout.cancelReasons.length === 0) {
          checkout.cancelReasons = checkoutDefaults.cancelReasons || [];
          existing.checkout = { ...checkoutDefaults, ...checkout };
          existing.markModified('checkout');
          changed = true;
        }
        if (!Array.isArray(checkout.ratingTags) || checkout.ratingTags.length === 0) {
          const nextCheckout = existing.checkout || { ...checkoutDefaults, ...checkout };
          nextCheckout.ratingTags = checkoutDefaults.ratingTags || [];
          existing.checkout = nextCheckout;
          existing.markModified('checkout');
          changed = true;
        }

        if (!existing.wallet || !Array.isArray(existing.wallet.topUpAmounts) || !existing.wallet.topUpAmounts.length) {
          existing.wallet = DEFAULT_APP_CONFIG.wallet;
          existing.markModified('wallet');
          changed = true;
        }
        if (!existing.catalog) {
          existing.catalog = DEFAULT_APP_CONFIG.catalog;
          existing.markModified('catalog');
          changed = true;
        }

        const labels = new Set(
          (existing.supportCategories || []).map((c) => String(c.label || '').trim())
        );
        const missingFaqCategories = FAQ_CATEGORIES.filter((name) => !labels.has(name));
        if (missingFaqCategories.length > 0 || !(existing.supportCategories || []).length) {
          existing.supportCategories = DEFAULT_APP_CONFIG.supportCategories;
          existing.markModified('supportCategories');
          changed = true;
          logger.info('Customer AppConfig: refreshed supportCategories for FAQ catalog');
        }

        if (changed) {
          await existing.save();
        }
      }
    } catch (err) {
      logger.warn('Customer AppConfig support patch failed', { error: err.message });
    }
  })();
}

module.exports = { run };
