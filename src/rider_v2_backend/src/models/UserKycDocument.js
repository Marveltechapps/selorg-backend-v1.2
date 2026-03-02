"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.UserKycDocument = void 0;

const mongoose = require("mongoose");

const UserKycDocumentSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    documentTypeCode: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["not_started", "pending", "verified", "failed"],
      default: "not_started",
    },
    rejectedReason: { type: String },
    fileUrl: { type: String },
    uploadedAt: { type: Date },
    verifiedAt: { type: Date },
  },
  { timestamps: true }
);

UserKycDocumentSchema.index({ userId: 1, documentTypeCode: 1 }, { unique: true });

const UserKycDocument = mongoose.model("UserKycDocument", UserKycDocumentSchema);
exports.UserKycDocument = UserKycDocument;
