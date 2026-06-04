"use strict";

const express = require("express");
const { z } = require("zod");
const { authenticate } = require("../../middleware/authenticate.js");
const cashService = require("./cash.service.js");

const router = express.Router();

const depositSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(["upi", "cash", "net_banking"]).optional(),
  referenceId: z.string().optional(),
  note: z.string().optional(),
});

router.get("/summary", authenticate, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const summary = await cashService.getCashSummary(req.user.id);
    res.json(summary);
  } catch (err) {
    console.error("[Cash] summary error:", err);
    res.status(500).json({ error: "Failed to fetch cash summary" });
  }
});

router.get("/transactions", authenticate, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const transactions = await cashService.getCashTransactions(req.user.id, limit);
    res.json({ transactions });
  } catch (err) {
    console.error("[Cash] transactions error:", err);
    res.status(500).json({ error: "Failed to fetch cash transactions" });
  }
});

router.post("/deposit", authenticate, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const parsed = depositSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const deposit = await cashService.createCashDeposit(req.user.id, parsed.data);
    res.status(201).json({ deposit, message: "Deposit recorded successfully" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record deposit";
    res.status(400).json({ error: message });
  }
});

module.exports = { cashRouter: router };
