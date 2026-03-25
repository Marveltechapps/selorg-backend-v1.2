"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.getFaqByKey = void 0;

const { Content } = require("../../models/Content.js");
const { LegalDocument } = require("../../../../customer-backend/models/LegalDocument");

async function getFaqByKey(key, locale = "en") {
  const doc = await Content.findOne({ key, locale }).lean();
  if (!doc) return null;
  return {
    title: doc.title || "",
    faqs: (doc.items || []).map((item) => ({
      id: item.id || "",
      question: item.question || "",
      answer: item.answer || "",
    })),
  };
}

exports.getFaqByKey = getFaqByKey;

async function getContentByKey(key, locale = "en") {
  const normalizedKey = String(key || "").trim().toLowerCase();

  // Keep Terms/Privacy in sync with Admin Legal Documents.
  if (normalizedKey === "terms" || normalizedKey === "privacy") {
    const legalDoc = await LegalDocument.findOne({
      type: normalizedKey,
      isCurrent: true,
    }).lean();

    if (legalDoc) {
      return {
        title:
          legalDoc.title ||
          (normalizedKey === "terms" ? "Terms & Conditions" : "Privacy Policy"),
        body: legalDoc.content || "",
      };
    }
  }

  const doc = await Content.findOne({ key, locale }).lean();
  if (!doc) return null;
  const items = doc.items || [];
  const body = items[0]?.answer || "";
  return {
    title: doc.title || "",
    body,
  };
}

exports.getContentByKey = getContentByKey;
