"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.getFaqByKey = void 0;

const { Content } = require("../../models/Content.js");

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
