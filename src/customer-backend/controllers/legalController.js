const { LegalConfig } = require('../models/LegalConfig');
const { LegalDocument } = require('../models/LegalDocument');
const { CustomerUser } = require('../models/CustomerUser');

const CONFIG_KEY = 'login_legal';

function toLoginLegalDto(doc) {
  if (!doc || !doc.loginLegal) return getDefaultLoginLegal();
  const { preamble, terms, privacy, connector } = doc.loginLegal;
  return {
    preamble: preamble != null ? preamble : 'By continuing, you agree to our ',
    terms: {
      label: terms?.label ?? 'Terms of Service',
      type: terms?.type === 'url' ? 'url' : 'in_app',
      url: terms?.type === 'url' ? terms?.url ?? null : null,
    },
    privacy: {
      label: privacy?.label ?? 'Privacy Policy',
      type: privacy?.type === 'url' ? 'url' : 'in_app',
      url: privacy?.type === 'url' ? privacy?.url ?? null : null,
    },
    connector: connector != null ? connector : ' and ',
  };
}

function getDefaultLoginLegal() {
  return {
    preamble: 'By continuing, you agree to our ',
    terms: { label: 'Terms of Service', type: 'in_app', url: null },
    privacy: { label: 'Privacy Policy', type: 'in_app', url: null },
    connector: ' and ',
  };
}

async function getConfig(_req, res) {
  try {
    const doc = await LegalConfig.findOne({ key: CONFIG_KEY }).lean();
    const loginLegal = toLoginLegalDto(doc);
    res.status(200).json({ success: true, data: { loginLegal } });
  } catch (err) {
    console.error('getConfig error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

function toLegalDocumentDto(doc) {
  if (!doc) return null;
  return {
    id: doc._id ? String(doc._id) : undefined,
    version: doc.version,
    title: doc.title,
    effectiveDate: doc.effectiveDate,
    lastUpdated: doc.lastUpdated,
    contentFormat: doc.contentFormat || 'plain',
    content: doc.content,
  };
}

async function getTerms(req, res) {
  try {
    const version = req.query.version || req.query.v;
    let doc;
    if (version) {
      doc = await LegalDocument.findOne({ type: 'terms', version }).lean();
    } else {
      doc = await LegalDocument.findOne({ type: 'terms', isCurrent: true }).lean();
    }
    if (!doc) {
      res.status(404).json({ success: false, message: 'Terms of Service not found' });
      return;
    }
    res.status(200).json({ success: true, data: toLegalDocumentDto(doc) });
  } catch (err) {
    console.error('getTerms error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function getPrivacy(req, res) {
  try {
    const version = req.query.version || req.query.v;
    let doc;
    if (version) {
      doc = await LegalDocument.findOne({ type: 'privacy', version }).lean();
    } else {
      doc = await LegalDocument.findOne({ type: 'privacy', isCurrent: true }).lean();
    }
    if (!doc) {
      res.status(404).json({ success: false, message: 'Privacy Policy not found' });
      return;
    }
    res.status(200).json({ success: true, data: toLegalDocumentDto(doc) });
  } catch (err) {
    console.error('getPrivacy error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function accept(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const { termsVersion, privacyVersion } = req.body || {};
    const update = {};
    if (termsVersion != null) {
      update.acceptedTermsVersion = termsVersion;
      update.acceptedTermsAt = new Date();
    }
    if (privacyVersion != null) {
      update.acceptedPrivacyVersion = privacyVersion;
      update.acceptedPrivacyAt = new Date();
    }
    if (Object.keys(update).length === 0) {
      res.status(400).json({ success: false, message: 'termsVersion or privacyVersion required' });
      return;
    }
    const user = await CustomerUser.findByIdAndUpdate(userId, { $set: update }, { new: true }).lean();
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    res.status(200).json({
      success: true,
      data: {
        acceptedTermsVersion: user.acceptedTermsVersion ?? termsVersion,
        acceptedPrivacyVersion: user.acceptedPrivacyVersion ?? privacyVersion,
      },
    });
  } catch (err) {
    console.error('accept error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { getConfig, getTerms, getPrivacy, accept };
