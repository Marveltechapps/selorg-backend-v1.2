const Certificate = require('../models/Certificate');
const { mergeHubFilter, hubFieldsForCreate } = require('../constants/hubScope');

async function listCertificatesByVendor(vendorId, query = {}) {
  const filter = {};
  if (vendorId) filter.vendorId = vendorId;
  if (query.status && query.status !== 'all') filter.status = query.status;
  const data = await Certificate.find(mergeHubFilter(filter)).lean();
  return data;
}

async function createCertificate(vendorId, payload, fileUrl) {
  const cert = new Certificate({
    ...hubFieldsForCreate(),
    vendorId,
    type: payload.type,
    issuedBy: payload.issuedBy,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    status: payload.status || 'valid',
    fileUrl: fileUrl || payload.fileUrl,
    metadata: payload.metadata || {},
  });
  await cert.save();
  return cert.toObject();
}

async function getCertificateById(id) {
  const cert = await Certificate.findOne(mergeHubFilter({ _id: id })).lean();
  if (!cert) {
    const err = new Error('Certificate not found');
    err.status = 404;
    throw err;
  }
  return cert;
}

async function revokeCertificate(id) {
  const cert = await Certificate.findOne(mergeHubFilter({ _id: id }));
  if (!cert) {
    const err = new Error('Certificate not found');
    err.status = 404;
    throw err;
  }
  cert.status = 'revoked';
  await cert.save();
  return;
}

module.exports = {
  listCertificatesByVendor,
  createCertificate,
  getCertificateById,
  revokeCertificate,
};

