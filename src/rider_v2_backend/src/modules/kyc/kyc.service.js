"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertUserDocument = exports.getUserStatus = exports.getDocumentTypes = void 0;

const { KycDocumentType } = require("../../models/KycDocumentType.js");
const { UserKycDocument } = require("../../models/UserKycDocument.js");
const { Rider } = require("../../models/Rider.js");
const { uploadToS3 } = require("../../services/s3.service.js");
const crypto = require("crypto");

const DEFAULT_TYPES = [
  { code: "aadhar", label: "Aadhar Card", iconKey: "aadhar", required: true, sortOrder: 1 },
  { code: "pan", label: "PAN Card", iconKey: "pan", required: true, sortOrder: 2 },
  { code: "drivingLicense", label: "Driving License", iconKey: "drivingLicense", required: true, sortOrder: 3 },
  { code: "vehicleRC", label: "Vehicle RC", iconKey: "vehicleRC", required: false, sortOrder: 4 },
  { code: "vehicleInsurance", label: "Vehicle Insurance", iconKey: "vehicleInsurance", required: false, sortOrder: 5 },
];

async function ensureDefaultTypes() {
  console.log("[KYC] Synchronizing default document types...");
  for (const type of DEFAULT_TYPES) {
    await KycDocumentType.findOneAndUpdate(
      { code: type.code },
      { $set: type },
      { upsert: true, new: true }
    );
  }
}

async function getDocumentTypes() {
  await ensureDefaultTypes();
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
  await ensureDefaultTypes();
  const types = await KycDocumentType.find({ active: true }).sort({ sortOrder: 1 });
  const rider = await Rider.findOne({ riderId: userId }).lean();
  
  const documents = rider?.documents || {};
  
  return types.map((t) => {
    const doc = documents[t.code] || {};
    return {
      documentTypeCode: t.code,
      label: t.label,
      iconKey: t.iconKey,
      required: t.required,
      status: doc.status || "not_started",
      uploadedAt: doc.uploadedAt,
      fileUrl: doc.documentUrl,
      documentNumber: doc.number,
    };
  });
}

exports.getUserStatus = getUserStatus;

async function upsertUserDocument(userId, documentTypeCode, fileBuffer, mimeType, originalName, documentNumber) {
  console.log(`[KYC] Upserting document to Rider profile: userId=${userId}, type=${documentTypeCode}, number=${documentNumber}`);
  await ensureDefaultTypes();
  const type = await KycDocumentType.findOne({ code: documentTypeCode, active: true });
  if (!type) {
    console.error(`[KYC] Invalid document type: ${documentTypeCode}`);
    throw new Error("Invalid document type");
  }
  
  const key = `riders/${userId}/kyc/${documentTypeCode}/${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${(originalName || "file").replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  console.log(`[KYC] Uploading to S3: key=${key}`);
  const fileUrl = await uploadToS3(fileBuffer, key, mimeType, { bucket: "documents" });
  console.log(`[KYC] S3 upload successful: url=${fileUrl}`);
  
  const now = new Date();
  const updateData = {};
  updateData[`documents.${documentTypeCode}`] = {
    number: documentNumber,
    status: "pending", // Set status to pending until admin approves
    documentUrl: fileUrl,
    uploadedAt: now,
  };

  console.log(`[KYC] Updating Rider profile: userId=${userId}`);
  const updatedRider = await Rider.findOneAndUpdate(
    { riderId: userId },
    { $set: updateData },
    { new: true }
  );

  if (!updatedRider) {
    console.error(`[KYC] Rider not found for update: userId=${userId}`);
    throw new Error("Rider not found");
  }

  const savedDoc = updatedRider.documents[documentTypeCode];

  return {
    documentTypeCode,
    status: savedDoc.status,
    uploadedLink: savedDoc.documentUrl,
    documentNumber: savedDoc.number,
    uploadedAt: savedDoc.uploadedAt,
  };
}

exports.upsertUserDocument = upsertUserDocument;
