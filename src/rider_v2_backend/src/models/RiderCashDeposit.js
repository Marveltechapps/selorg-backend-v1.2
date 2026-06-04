"use strict";

const mongoose = require("mongoose");

const RiderCashDepositSchema = new mongoose.Schema(
  {
    riderId: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    method: { type: String, enum: ["upi", "cash", "net_banking"], default: "upi" },
    status: { type: String, enum: ["pending", "success", "failed"], default: "success" },
    referenceId: { type: String },
    note: { type: String },
  },
  { timestamps: true }
);

RiderCashDepositSchema.index({ riderId: 1, createdAt: -1 });

const RiderCashDeposit =
  mongoose.models.RiderCashDeposit ||
  mongoose.model("RiderCashDeposit", RiderCashDepositSchema);

module.exports = { RiderCashDeposit };
