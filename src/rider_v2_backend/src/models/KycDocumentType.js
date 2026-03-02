"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.KycDocumentType = void 0;

const mongoose = require("mongoose");

const KycDocumentTypeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    label: { type: String, required: true },
    iconKey: { type: String, required: true },
    required: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const KycDocumentType = mongoose.model("KycDocumentType", KycDocumentTypeSchema);
exports.KycDocumentType = KycDocumentType;
