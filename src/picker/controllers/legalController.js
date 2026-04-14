const { LegalDocument } = require('../../customer-backend/models/LegalDocument');
const { LegalConfig } = require('../../customer-backend/models/LegalConfig');

const CONFIG_KEY = 'picker_login_legal';
const APP_TARGET = 'picker';

function getDefaultPickerLoginLegal() {
  return {
    preamble: 'By continuing, you agree to our ',
    terms: { label: 'Terms & Conditions', type: 'in_app', url: null },
    privacy: { label: 'Privacy Policy', type: 'in_app', url: null },
    connector: ' and ',
  };
}

function toPickerLoginLegalDto(doc) {
  if (!doc || !doc.loginLegal) return getDefaultPickerLoginLegal();
  const { preamble, terms, privacy, connector } = doc.loginLegal;
  return {
    preamble: preamble != null ? preamble : 'By continuing, you agree to our ',
    terms: {
      label: terms?.label ?? 'Terms & Conditions',
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

async function getConfig(_req, res) {
  try {
    const doc = await LegalConfig.findOne({ key: CONFIG_KEY }).lean();
    const loginLegal = doc ? toPickerLoginLegalDto(doc) : getDefaultPickerLoginLegal();
    res.status(200).json({ success: true, data: { loginLegal } });
  } catch (err) {
    console.error('picker getConfig error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function getTerms(req, res) {
  try {
    const version = req.query.version || req.query.v;
    let doc;
    if (version) {
      doc = await LegalDocument.findOne({ type: 'terms', version, appTarget: APP_TARGET }).lean();
    } else {
      doc = await LegalDocument.findOne({ type: 'terms', appTarget: APP_TARGET, isCurrent: true }).lean();
    }
    if (!doc) {
      res.status(404).json({ success: false, message: 'Terms & Conditions not found' });
      return;
    }
    res.status(200).json({ success: true, data: toLegalDocumentDto(doc) });
  } catch (err) {
    console.error('picker getTerms error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function getPrivacy(req, res) {
  try {
    const version = req.query.version || req.query.v;
    let doc;
    if (version) {
      doc = await LegalDocument.findOne({ type: 'privacy', version, appTarget: APP_TARGET }).lean();
    } else {
      doc = await LegalDocument.findOne({ type: 'privacy', appTarget: APP_TARGET, isCurrent: true }).lean();
    }
    if (!doc) {
      res.status(404).json({ success: false, message: 'Privacy Policy not found' });
      return;
    }
    res.status(200).json({ success: true, data: toLegalDocumentDto(doc) });
  } catch (err) {
    console.error('picker getPrivacy error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { getConfig, getTerms, getPrivacy };
