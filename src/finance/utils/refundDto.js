/**
 * Normalizes RefundRequest documents for finance dashboard APIs.
 */

function toIso(value) {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapRefundDto(doc, orderMeta = null) {
  if (!doc) return null;
  const rawOrderId = String(doc.orderId ?? '');
  const resolvedAmount =
    Number(doc.amount) > 0
      ? Number(doc.amount)
      : Number(orderMeta?.refundAmount ?? orderMeta?.totalBill ?? orderMeta?.itemTotal ?? 0);

  return {
    id: String(doc._id ?? doc.id),
    orderId: doc.orderNumber || rawOrderId,
    orderIdRaw: rawOrderId,
    orderNumber: doc.orderNumber || orderMeta?.orderNumber || '',
    customerId: String(doc.customerId ?? ''),
    customerName: doc.customerName || 'Customer',
    customerEmail: doc.customerEmail || '',
    customerPhone: doc.customerPhone || '',
    reasonCode: doc.reasonCode,
    reasonText: doc.reasonText,
    amount: resolvedAmount,
    currency: doc.currency || 'INR',
    requestedAt: toIso(doc.requestedAt) || new Date().toISOString(),
    status: doc.status,
    channel: doc.channel,
    refundMethod: doc.refundMethod || 'original_payment',
    paymentId: doc.paymentId,
    transactionId: doc.transactionId,
    notes: doc.notes,
    rejectionReason: doc.rejectionReason,
    timeline: doc.timeline || [],
    missingItems: doc.missingItems || [],
    processedAt: toIso(doc.processedAt),
    completedAt: toIso(doc.completedAt),
  };
}

module.exports = { mapRefundDto };
