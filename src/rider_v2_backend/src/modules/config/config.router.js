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

exports.configRouter = router;
