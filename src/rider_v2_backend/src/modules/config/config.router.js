"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.configRouter = void 0;

const express = require("express");
const configService = require("./config.service.js");

const router = express.Router();

router.get("/", (req, res) => {
  try {
    const config = configService.getAppConfig();
    res.json(config);
  } catch (err) {
    console.error("[Config] getAppConfig:", err);
    res.status(500).json({ error: "Failed to fetch config", code: "INTERNAL_ERROR" });
  }
});

const IFSC_BANK_PREFIX = {
  HDFC: "HDFC Bank",
  SBIN: "State Bank of India",
  ICIC: "ICICI Bank",
  UTIB: "Axis Bank",
  KKBK: "Kotak Mahindra Bank",
  YESB: "Yes Bank",
  PUNB: "Punjab National Bank",
  BARB: "Bank of Baroda",
  CNRB: "Canara Bank",
  IDIB: "Indian Bank",
  UBIN: "Union Bank of India",
};

router.get("/ifsc/:code", (req, res) => {
  const code = String(req.params.code || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) {
    return res.status(400).json({ error: "Invalid IFSC format" });
  }
  const bankName = IFSC_BANK_PREFIX[code.slice(0, 4)] || null;
  res.json({ ifsc: code, bankName, valid: !!bankName });
});

exports.configRouter = router;
