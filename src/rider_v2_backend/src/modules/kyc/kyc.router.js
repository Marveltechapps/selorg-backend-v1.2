"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.kycRouter = void 0;

const express = require("express");
const multer = require("multer");
const { authenticate } = require("../../middleware/authenticate.js");
const kycService = require("./kyc.service.js");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get("/document-types", async (req, res) => {
  try {
    const list = await kycService.getDocumentTypes();
    return res.json({ documentTypes: list });
  } catch (err) {
    console.error("[KYC] getDocumentTypes:", err);
    return res.status(500).json({ error: "Failed to fetch document types", code: "INTERNAL_ERROR" });
  }
});

router.get("/status", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const statuses = await kycService.getUserStatus(userId);
    return res.json({ documents: statuses });
  } catch (err) {
    console.error("[KYC] getUserStatus:", err);
    return res.status(500).json({ error: "Failed to fetch KYC status", code: "INTERNAL_ERROR" });
  }
});

router.post(
  "/upload",
  authenticate,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded", code: "MISSING_FILE" });
      }
      const documentTypeCode = req.body.documentTypeCode || req.body.documentType;
      if (!documentTypeCode) {
        return res.status(400).json({ error: "documentTypeCode is required", code: "MISSING_TYPE" });
      }
      const userId = req.user.id;
      const result = await kycService.upsertUserDocument(
        userId,
        documentTypeCode,
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname
      );
      return res.json({
        documentTypeCode: result.documentTypeCode,
        status: result.status,
        uploadedLink: result.uploadedLink || result.fileUrl || null,
        rejectedReason: result.rejectedReason,
        uploadedAt: result.uploadedAt,
        verifiedAt: result.verifiedAt,
      });
    } catch (err) {
      if (err.message === "Invalid document type") {
        return res.status(400).json({ error: err.message, code: "INVALID_TYPE" });
      }
      if (err.message && err.message.includes("S3")) {
        return res.status(503).json({ error: "Upload service unavailable", code: "S3_ERROR" });
      }
      console.error("[KYC] upload:", err);
      return res.status(500).json({ error: "Upload failed", code: "INTERNAL_ERROR" });
    }
  }
);

exports.kycRouter = router;
