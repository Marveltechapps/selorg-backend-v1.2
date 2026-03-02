const mongoose = require('mongoose');
const { PaymentMethod } = require('../models/PaymentMethod');

function toResponse(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(o._id),
    type: o.type,
    last4: o.last4,
    brand: o.brand || '',
    cardholderName: o.cardholderName || '',
    expiryMonth: o.meta?.expiryMonth || '',
    expiryYear: o.meta?.expiryYear || '',
    upiId: o.upiId,
    walletName: o.walletName,
    isDefault: Boolean(o.isDefault),
  };
}

async function listByUserId(userId) {
  const list = await PaymentMethod.find({ userId: new mongoose.Types.ObjectId(userId) })
    .sort({ isDefault: -1, createdAt: 1 })
    .lean();
  return list.map(toResponse);
}

function detectCardBrand(cardNumber) {
  const num = String(cardNumber).replace(/\s/g, '');
  if (/^4/.test(num)) return 'Visa';
  if (/^5[1-5]/.test(num) || /^2[2-7]/.test(num)) return 'Mastercard';
  if (/^6(?:011|5)/.test(num)) return 'RuPay';
  if (/^3[47]/.test(num)) return 'Amex';
  return 'Card';
}

async function addMethod(userId, body) {
  const { type, cardNumber, expiryMonth, expiryYear, cardholderName, upiId, walletName } = body || {};
  const last4 = cardNumber ? String(cardNumber).replace(/\s/g, '').slice(-4) : (upiId ? (String(upiId).slice(-4) || '') : '');
  const brand = cardNumber ? detectCardBrand(cardNumber) : '';
  const count = await PaymentMethod.countDocuments({ userId: new mongoose.Types.ObjectId(userId) });
  const isDefault = count === 0;
  const doc = await PaymentMethod.create({
    userId: new mongoose.Types.ObjectId(userId),
    type: type || 'upi',
    last4: last4 || '',
    brand,
    cardholderName: cardholderName || '',
    upiId: upiId || '',
    walletName: walletName || '',
    isDefault,
    meta: expiryMonth && expiryYear ? { expiryMonth, expiryYear } : {},
  });
  if (isDefault) {
    await PaymentMethod.updateMany(
      { userId: new mongoose.Types.ObjectId(userId), _id: { $ne: doc._id } },
      { $set: { isDefault: false } }
    );
  }
  return toResponse(doc);
}

async function updateMethod(userId, methodId, body) {
  const method = await PaymentMethod.findOne({
    _id: methodId,
    userId: new mongoose.Types.ObjectId(userId),
  });
  if (!method) return null;
  const { cardNumber, expiryMonth, expiryYear, cardholderName } = body || {};
  if (cardNumber) {
    method.last4 = String(cardNumber).replace(/\s/g, '').slice(-4);
    method.brand = detectCardBrand(cardNumber);
  }
  if (cardholderName !== undefined) method.cardholderName = cardholderName;
  if (expiryMonth && expiryYear) {
    method.meta = { ...method.meta, expiryMonth, expiryYear };
  }
  await method.save();
  return toResponse(method);
}

async function removeMethod(userId, methodId) {
  const deleted = await PaymentMethod.findOneAndDelete({
    _id: methodId,
    userId: new mongoose.Types.ObjectId(userId),
  });
  if (deleted && deleted.isDefault) {
    const next = await PaymentMethod.findOne({ userId: new mongoose.Types.ObjectId(userId) }).sort({ createdAt: 1 });
    if (next) {
      next.isDefault = true;
      await next.save();
    }
  }
  return !!deleted;
}

async function setDefault(userId, methodId) {
  const method = await PaymentMethod.findOne({
    _id: methodId,
    userId: new mongoose.Types.ObjectId(userId),
  });
  if (!method) return null;
  await PaymentMethod.updateMany(
    { userId: new mongoose.Types.ObjectId(userId) },
    { $set: { isDefault: false } }
  );
  method.isDefault = true;
  await method.save();
  return toResponse(method);
}

module.exports = { listByUserId, addMethod, updateMethod, removeMethod, setDefault };
