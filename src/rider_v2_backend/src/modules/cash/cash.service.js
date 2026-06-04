"use strict";

const { Order } = require("../../models/Order.js");
const { RiderCashDeposit } = require("../../models/RiderCashDeposit.js");

function formatDateTime(d) {
  const date = new Date(d);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  if (isToday) return `Today, ${time}`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) + `, ${time}`;
}

async function getCodCollectedOrders(riderId, limit = 50) {
  const orders = await Order.find({
    "riderAssignment.riderId": riderId,
    "payment.method": "cod",
    "metadata.codCollectedAt": { $exists: true, $ne: null },
  })
    .sort({ "metadata.codCollectedAt": -1 })
    .limit(limit)
    .select("orderNumber pricing.total payment.amount metadata.codCollectedAt")
    .lean();

  return orders.map((o, i) => ({
    id: `collected-${o._id}-${i}`,
    type: "collected",
    title: "Cash Collected",
    amount: o.pricing?.total ?? o.payment?.amount ?? 0,
    dateTime: formatDateTime(o.metadata.codCollectedAt),
    orderId: o.orderNumber ? `#${o.orderNumber}` : undefined,
    createdAt: o.metadata.codCollectedAt,
  }));
}

async function getDeposits(riderId, limit = 50) {
  const deposits = await RiderCashDeposit.find({ riderId, status: "success" })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return deposits.map((d) => ({
    id: String(d._id),
    type: "deposited",
    title: "Cash Deposited",
    amount: d.amount,
    dateTime: formatDateTime(d.createdAt),
    status: "SUCCESS",
    referenceId: d.referenceId,
    createdAt: d.createdAt,
  }));
}

async function getCashSummary(riderId) {
  const [collectedRows, depositedRows] = await Promise.all([
    getCodCollectedOrders(riderId, 200),
    getDeposits(riderId, 200),
  ]);

  const totalCollected = collectedRows.reduce((s, t) => s + (t.amount || 0), 0);
  const totalDeposited = depositedRows.reduce((s, t) => s + (t.amount || 0), 0);
  const cashToDeposit = Math.max(0, totalCollected - totalDeposited);

  return {
    totalCollected,
    totalDeposited,
    cashToDeposit,
    transactionCount: collectedRows.length + depositedRows.length,
  };
}

async function getCashTransactions(riderId, limit = 50) {
  const [collected, deposited] = await Promise.all([
    getCodCollectedOrders(riderId, limit),
    getDeposits(riderId, limit),
  ]);
  return [...collected, ...deposited]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)
    .map(({ createdAt, ...rest }) => rest);
}

async function createCashDeposit(riderId, { amount, method, referenceId, note }) {
  const summary = await getCashSummary(riderId);
  if (amount > summary.cashToDeposit) {
    throw new Error(`Deposit amount exceeds cash due (₹${summary.cashToDeposit})`);
  }

  const deposit = await RiderCashDeposit.create({
    riderId,
    amount,
    method: method || "upi",
    status: "success",
    referenceId: referenceId || `DEP-${Date.now()}`,
    note,
  });

  return deposit;
}

module.exports = {
  getCashSummary,
  getCashTransactions,
  createCashDeposit,
};
