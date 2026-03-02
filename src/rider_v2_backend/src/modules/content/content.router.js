"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.contentRouter = void 0;

const express = require("express");
const contentService = require("./content.service.js");

const router = express.Router();

router.get("/faq/:key", async (req, res) => {
  try {
    const { key } = req.params;
    const locale = req.query.locale || "en";
    const data = await contentService.getFaqByKey(key, locale);
    if (!data) {
      return res.status(404).json({ error: "FAQ not found", code: "NOT_FOUND" });
    }
    return res.json(data);
  } catch (err) {
    console.error("[Content] getFaq:", err);
    return res.status(500).json({ error: "Failed to fetch FAQ", code: "INTERNAL_ERROR" });
  }
});

exports.contentRouter = router;
