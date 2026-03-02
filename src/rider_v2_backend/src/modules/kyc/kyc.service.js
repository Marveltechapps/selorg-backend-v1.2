"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertUserDocument = exports.getUserStatus = exports.getDocumentTypes = void 0;

const { KycDocumentType } = require("../../models/KycDocumentType.js");
const { UserKycDocument } = require("../../models/UserKycDocument.js");
const { uploadToS3 } = require("../../services/s3.service.js");
const crypto = require("crypto");

async function getDocumentTypes() {
  const list = await KycDocumentType.find({ active: true }).sort({ sortOrder: 1 });
  return list.map((d) => ({
    code: d.code,
    label: d.label,
    iconKey: d.iconKey,
    required: d.required,
    sortOrder: d.sortOrder,
  }));
}

exports.getDocumentTypes = getDocumentTypes;

async function getUserStatus(userId) {
  const types = await KycDocumentType.find({ active: true }).sort({ sortOrder: 1 });
  const userDocs = await UserKycDocument.find({ userId }).lean();
  const byCode = {};
  userDocs.forEach((d) => {
    byCode[d.documentTypeCode] = d;
  });
  return types.map((t) => {
    const doc = byCode[t.code];
    return {
      documentTypeCode: t.code,
      label: t.label,
      iconKey: t.iconKey,
      required: t.required,
      status: doc ? doc.status : "not_started",
      rejectedReason: doc ? doc.rejectedReason : undefined,
      uploadedAt: doc ? doc.uploadedAt : undefined,
      verifiedAt: doc ? doc.verifiedAt : undefined,
      fileUrl: doc && doc.fileUrl ? doc.fileUrl : undefined,
    };
  });
}

exports.getUserStatus = getUserStatus;

async function upsertUserDocument(userId, documentTypeCode, fileBuffer, mimeType, originalName) {
  const type = await KycDocumentType.findOne({ code: documentTypeCode, active: true });
  if (!type) {
    throw new Error("Invalid document type");
  }
  const key = `riders/${userId}/kyc/${documentTypeCode}/${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${(originalName || "file").replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const fileUrl = await uploadToS3(fileBuffer, key, mimeType, { bucket: "documents" });
  const now = new Date();
  const doc = await UserKycDocument.findOneAndUpdate(
    { userId, documentTypeCode },
    {
      status: "verified",
      fileUrl,
      uploadedAt: now,
      verifiedAt: now,
      rejectedReason: undefined,
    },
    { upsert: true, new: true }
  );
  return {
    documentTypeCode: doc.documentTypeCode,
    status: doc.status,
    uploadedLink: fileUrl,
    rejectedReason: doc.rejectedReason,
    uploadedAt: doc.uploadedAt,
    verifiedAt: doc.verifiedAt,
  };
}

exports.upsertUserDocument = upsertUserDocument;
