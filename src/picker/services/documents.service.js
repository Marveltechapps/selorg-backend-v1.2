/**
 * Documents service – source of truth for picker document storage and status.
 * Upload persists to MongoDB and returns only saved state.
 */
const Document = require('../models/document.model');
const { withTimeout, DB_TIMEOUT_MS } = require('../utils/realtime.util');

const DOC_TYPES = ['aadhar', 'pan'];
const SIDES = ['front', 'back'];

const emptyDocs = { aadhar: { front: null, back: null }, pan: { front: null, back: null } };

const createEmptyDetail = (docType) => ({
  docType,
  status: 'not_uploaded',
  rejectionReason: null,
  reviewedAt: null,
  sides: {
    front: { url: null, status: 'not_uploaded', rejectionReason: null, reviewedAt: null, uploadedAt: null, updatedAt: null },
    back: { url: null, status: 'not_uploaded', rejectionReason: null, reviewedAt: null, uploadedAt: null, updatedAt: null },
  },
});

const normalizeStatus = (status) => {
  if (status === 'approved' || status === 'rejected' || status === 'pending') return status;
  return 'pending';
};

const aggregateDocumentStatus = (detail) => {
  const frontUrl = detail.sides.front.url;
  const backUrl = detail.sides.back.url;
  const sideStatuses = SIDES
    .map((side) => detail.sides[side].status)
    .filter((status) => status !== 'not_uploaded');

  if (!frontUrl && !backUrl) return 'not_uploaded';
  if (!frontUrl || !backUrl) return 'partial';
  if (sideStatuses.includes('rejected')) return 'rejected';
  if (sideStatuses.length === 2 && sideStatuses.every((status) => status === 'approved')) return 'approved';
  return 'pending';
};

const buildDocumentPayload = (records) => {
  const documents = { aadhar: { front: null, back: null }, pan: { front: null, back: null } };
  const details = {
    aadhar: createEmptyDetail('aadhar'),
    pan: createEmptyDetail('pan'),
  };

  for (const record of records) {
    if (!DOC_TYPES.includes(record.docType) || !SIDES.includes(record.side)) continue;
    documents[record.docType][record.side] = record.url;
    details[record.docType].sides[record.side] = {
      url: record.url,
      status: normalizeStatus(record.status),
      rejectionReason: record.rejectionReason ?? null,
      reviewedAt: record.reviewedAt ? new Date(record.reviewedAt).toISOString() : null,
      uploadedAt: record.createdAt ? new Date(record.createdAt).toISOString() : null,
      updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString() : null,
    };
  }

  let uploadedCount = 0;
  let approvedCount = 0;
  let pendingCount = 0;
  let rejectedCount = 0;
  let partialCount = 0;

  for (const docType of DOC_TYPES) {
    const detail = details[docType];
    detail.status = aggregateDocumentStatus(detail);
    detail.rejectionReason =
      detail.sides.front.rejectionReason || detail.sides.back.rejectionReason || null;
    detail.reviewedAt = detail.sides.front.reviewedAt || detail.sides.back.reviewedAt || null;

    if (detail.status === 'approved') approvedCount += 1;
    else if (detail.status === 'rejected') rejectedCount += 1;
    else if (detail.status === 'pending') pendingCount += 1;
    else if (detail.status === 'partial') partialCount += 1;

    if (detail.sides.front.url && detail.sides.back.url) uploadedCount += 1;
  }

  return {
    documents,
    details,
    summary: {
      requiredCount: DOC_TYPES.length,
      uploadedCount,
      approvedCount,
      pendingCount,
      rejectedCount,
      partialCount,
      fullyUploaded: uploadedCount === DOC_TYPES.length,
    },
  };
};

const upload = async (userId, docType, side, url) => {
  const doc = await withTimeout(
    Document.findOneAndUpdate(
      { userId, docType, side },
      {
        $set: {
          url,
          status: 'pending',
          rejectionReason: null,
          reviewedAt: null,
          reviewedBy: null,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean(),
    DB_TIMEOUT_MS
  );

  if (!doc?.url) {
    throw new Error('Document upload was not persisted');
  }

  return {
    success: true,
    message: 'Document uploaded successfully',
    documentUrl: doc.url,
    document: {
      docType: doc.docType,
      side: doc.side,
      status: normalizeStatus(doc.status),
      rejectionReason: doc.rejectionReason ?? null,
      reviewedAt: doc.reviewedAt ? new Date(doc.reviewedAt).toISOString() : null,
      uploadedAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    },
  };
};

const listByUser = async (userId) => {
  const list = await withTimeout(
    Document.find({ userId }).sort({ docType: 1, side: 1, updatedAt: -1 }).lean(),
    DB_TIMEOUT_MS
  );

  const payload = buildDocumentPayload(list || []);
  return { success: true, ...payload };
};

module.exports = { upload, listByUser, buildDocumentPayload, emptyDocs };
