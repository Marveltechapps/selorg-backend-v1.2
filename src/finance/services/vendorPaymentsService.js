const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const VendorInvoice = require('../models/VendorInvoice');
const VendorPayment = require('../models/VendorPayment');
const Vendor = require('../models/Vendor');
const logger = require('../../utils/logger');
const { uploadVendorPaymentDocument } = require('../../utils/s3Upload');
const {
  mergeHubFilter,
  hubFieldsForCreate,
  runWithVendorHub,
  getDefaultHubKey,
} = require('../../vendor/constants/hubScope');
const vendorService = require('../../vendor/services/vendorService');
const {
  WORKFLOW_STEPS,
  WORKFLOW_STEP_LABELS,
  getNextStep,
  isValidStep,
} = require('../constants/vendorPaymentWorkflow');

function toObjectIds(ids) {
  if (!Array.isArray(ids)) return [];
  return ids
    .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)))
    .map((id) => new mongoose.Types.ObjectId(String(id)));
}

function mapPaymentDoc(doc) {
  if (!doc) return null;
  const p = doc.toObject ? doc.toObject() : doc;
  return {
    id: p._id?.toString(),
    paymentId: p.paymentId,
    vendorId: p.vendorId,
    vendorName: p.vendorName,
    attachmentUrl: p.attachmentUrl,
    attachmentFileName: p.attachmentFileName,
    attachmentContentType: p.attachmentContentType,
    invoices: (p.invoices || []).map((line) => ({
      invoiceId: line.invoiceId?.toString?.() ?? String(line.invoiceId),
      invoiceNumber: line.invoiceNumber,
      amount: line.amount,
      currency: line.currency,
      currentStep: line.currentStep,
      currentStepLabel: WORKFLOW_STEP_LABELS[line.currentStep] || line.currentStep,
      lineStatus: line.lineStatus,
      workflowHistory: line.workflowHistory || [],
    })),
    totalAmount: p.totalAmount,
    paymentDate: p.paymentDate,
    method: p.method,
    reference: p.reference,
    overallStatus: p.overallStatus,
    createdBy: p.createdBy,
    completedAt: p.completedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    workflowSteps: WORKFLOW_STEPS.map((step) => ({
      key: step,
      label: WORKFLOW_STEP_LABELS[step],
    })),
  };
}

async function assertInvoicesNotInActivePayment(invoiceIds) {
  const active = await VendorPayment.findOne({
    ...mergeHubFilter({}),
    overallStatus: 'in_progress',
    'invoices.invoiceId': { $in: invoiceIds },
  }).lean();
  if (active) {
    throw new Error(
      `Invoice(s) already tied to in-progress payment ${active.paymentId}. Open that payment to continue the workflow.`
    );
  }
}

class VendorPaymentsService {
  async getPayablesSummary() {
    try {
      const outstanding = await VendorInvoice.find(
        mergeHubFilter({
          status: { $in: ['pending_approval', 'approved', 'scheduled', 'overdue'] },
        })
      ).lean();

      const pending = await VendorInvoice.find(mergeHubFilter({ status: 'pending_approval' })).lean();

      const overdue = await VendorInvoice.find(mergeHubFilter({ status: 'overdue' })).lean();

      const overdueVendors = new Set(overdue.map((i) => i.vendorId.toString())).size;

      return {
        outstandingPayablesAmount: outstanding.reduce((sum, inv) => sum + inv.amount, 0),
        outstandingHorizonText: 'Due next 30 days',
        pendingApprovalCount: pending.length,
        overdueAmount: overdue.reduce((sum, inv) => sum + inv.amount, 0),
        overdueVendorsCount: overdueVendors,
      };
    } catch (error) {
      logger.error('Error fetching payables summary:', error);
      throw error;
    }
  }

  async getVendorInvoices(filter) {
    try {
      const query = {};

      if (filter.status && filter.status !== 'all') {
        query.status = filter.status;
      }

      if (filter.vendorId && filter.vendorId !== 'all') {
        query.vendorId = filter.vendorId;
      }

      if (filter.dateFrom || filter.dateTo) {
        query.invoiceDate = {};
        if (filter.dateFrom) {
          query.invoiceDate.$gte = new Date(filter.dateFrom);
        }
        if (filter.dateTo) {
          query.invoiceDate.$lte = new Date(filter.dateTo);
        }
      }

      const page = filter.page || 1;
      const pageSize = filter.pageSize || 20;
      const skip = (page - 1) * pageSize;

      const scoped = mergeHubFilter(query);

      const [data, total] = await Promise.all([
        VendorInvoice.find(scoped).sort({ dueDate: 1 }).skip(skip).limit(pageSize).lean(),
        VendorInvoice.countDocuments(scoped),
      ]);

      return {
        data: data.map((invoice) => ({
          id: invoice._id.toString(),
          ...invoice,
        })),
        total,
        page,
        pageSize,
      };
    } catch (error) {
      logger.error('Error fetching vendor invoices:', error);
      throw error;
    }
  }

  async getVendorInvoiceDetails(id) {
    try {
      if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new Error('Invoice not found');
      }
      const invoice = await VendorInvoice.findOne(mergeHubFilter({ _id: id })).lean();
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      let vendor = null;
      if (invoice.vendorId && mongoose.Types.ObjectId.isValid(String(invoice.vendorId))) {
        vendor = await Vendor.findOne(mergeHubFilter({ _id: invoice.vendorId })).lean();
      }

      let paymentWorkflow = null;
      if (invoice.paymentId) {
        paymentWorkflow = await this.getPaymentByPaymentId(invoice.paymentId).catch(() => null);
      }

      return {
        id: invoice._id.toString(),
        ...invoice,
        vendorDetails: vendor,
        paymentWorkflow,
      };
    } catch (error) {
      logger.error('Error fetching vendor invoice details:', error);
      throw error;
    }
  }

  async approveInvoice(id) {
    try {
      if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new Error('Invoice not found');
      }
      const invoice = await VendorInvoice.findOneAndUpdate(
        mergeHubFilter({ _id: id }),
        { $set: { status: 'approved' } },
        { new: true, runValidators: true }
      ).lean();

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      return {
        id: invoice._id.toString(),
        ...invoice,
      };
    } catch (error) {
      logger.error('Error approving invoice:', error);
      throw error;
    }
  }

  async bulkApproveInvoices(ids) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('ids array is required and must not be empty');
      }
      const objectIds = toObjectIds(ids);
      if (objectIds.length === 0) {
        throw new Error('No valid invoice ids');
      }
      const result = await VendorInvoice.updateMany(
        mergeHubFilter({
          _id: { $in: objectIds },
          status: 'pending_approval',
        }),
        { $set: { status: 'approved' } }
      );
      const approved = await VendorInvoice.find(mergeHubFilter({ _id: { $in: objectIds } })).lean();
      return {
        approvedCount: result.modifiedCount,
        totalRequested: ids.length,
        data: approved.map((inv) => ({
          id: inv._id.toString(),
          ...inv,
        })),
      };
    } catch (error) {
      logger.error('Error bulk approving invoices:', error);
      throw error;
    }
  }

  async rejectInvoice(id, reason) {
    try {
      if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new Error('Invoice not found');
      }
      const invoice = await VendorInvoice.findOneAndUpdate(
        mergeHubFilter({ _id: id }),
        { $set: { status: 'rejected', notes: reason } },
        { new: true, runValidators: true }
      ).lean();

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      return {
        id: invoice._id.toString(),
        ...invoice,
      };
    } catch (error) {
      logger.error('Error rejecting invoice:', error);
      throw error;
    }
  }

  async markInvoicePaid(id) {
    try {
      if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new Error('Invoice not found');
      }
      const existing = await VendorInvoice.findOne(mergeHubFilter({ _id: id })).lean();
      if (!existing) {
        throw new Error('Invoice not found');
      }
      if (existing.status === 'scheduled' && existing.paymentId) {
        const activePayment = await VendorPayment.findOne(
          mergeHubFilter({ paymentId: existing.paymentId, overallStatus: 'in_progress' })
        ).lean();
        if (activePayment) {
          throw new Error(
            'Invoice is in an active payment workflow. Complete or cancel the workflow first.'
          );
        }
      }
      const invoice = await VendorInvoice.findOneAndUpdate(
        mergeHubFilter({ _id: id }),
        { $set: { status: 'paid', paymentId: `pay_${Date.now()}` } },
        { new: true, runValidators: true }
      ).lean();

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      return {
        id: invoice._id.toString(),
        ...invoice,
      };
    } catch (error) {
      logger.error('Error marking invoice as paid:', error);
      throw error;
    }
  }

  async uploadInvoice(data) {
    try {
      const raw = data && typeof data === 'object' ? { ...data } : {};
      delete raw.hubKey;
      delete raw._id;
      const invoice = new VendorInvoice({
        ...raw,
        ...hubFieldsForCreate(),
        status: 'pending_approval',
        uploadedAt: new Date(),
      });
      await invoice.save();

      return {
        id: invoice._id.toString(),
        ...invoice.toObject(),
      };
    } catch (error) {
      logger.error('Error uploading invoice:', error);
      throw error;
    }
  }

  async createPayment(request, file, createdBy) {
    try {
      if (!file || !file.buffer) {
        throw new Error('Payment supporting document (PDF or file) is required');
      }

      const invoicesPayload = request.invoices || [];
      if (!invoicesPayload.length) {
        throw new Error('At least one invoice is required');
      }

      const invoiceObjectIds = toObjectIds(invoicesPayload.map((i) => i.invoiceId));
      if (invoiceObjectIds.length !== invoicesPayload.length) {
        throw new Error('One or more invoice ids are invalid');
      }

      await assertInvoicesNotInActivePayment(invoiceObjectIds);

      const vendor = request.vendorId
        ? await Vendor.findOne(mergeHubFilter({ _id: request.vendorId })).lean()
        : null;

      const dbInvoices = await VendorInvoice.find(
        mergeHubFilter({
          _id: { $in: invoiceObjectIds },
          status: { $in: ['approved', 'overdue'] },
        })
      ).lean();

      if (dbInvoices.length !== invoiceObjectIds.length) {
        throw new Error('All invoices must exist, belong to this hub, and be approved or overdue');
      }

      const paymentId = `pay_${Date.now()}`;
      const hubFields = hubFieldsForCreate();
      const ext = file.originalname?.split('.').pop() || 'bin';
      const safeName = `${uuidv4()}.${ext}`;

      const attachmentUrl = await uploadVendorPaymentDocument(
        file.buffer,
        hubFields.hubKey,
        paymentId,
        safeName,
        file.mimetype || 'application/octet-stream'
      );

      const invoiceLines = dbInvoices.map((inv) => {
        const reqLine = invoicesPayload.find(
          (r) => String(r.invoiceId) === inv._id.toString()
        );
        return {
          invoiceId: inv._id,
          invoiceNumber: inv.invoiceNumber,
          amount: reqLine?.amount ?? inv.amount,
          currency: inv.currency || 'INR',
          currentStep: WORKFLOW_STEPS[0],
          lineStatus: 'in_progress',
          workflowHistory: [],
        };
      });

      const totalAmount = invoiceLines.reduce((sum, l) => sum + l.amount, 0);

      const payment = new VendorPayment({
        ...hubFields,
        paymentId,
        vendorId: String(request.vendorId),
        vendorName: vendor?.name || dbInvoices[0]?.vendorName || 'Unknown Vendor',
        attachmentUrl,
        attachmentFileName: file.originalname || safeName,
        attachmentContentType: file.mimetype,
        invoices: invoiceLines,
        totalAmount,
        paymentDate: new Date(request.paymentDate),
        method: request.method,
        reference: request.reference,
        overallStatus: 'in_progress',
        createdBy: createdBy || 'System',
      });
      await payment.save();

      await VendorInvoice.updateMany(
        mergeHubFilter({ _id: { $in: invoiceObjectIds } }),
        { $set: { status: 'scheduled', paymentId } }
      );

      return {
        success: true,
        paymentId,
        payment: mapPaymentDoc(payment),
      };
    } catch (error) {
      logger.error('Error creating payment:', error);
      throw error;
    }
  }

  async listPayments(filter = {}) {
    try {
      const query = mergeHubFilter({});
      if (filter.status && filter.status !== 'all') {
        query.overallStatus = filter.status;
      }
      if (filter.vendorId && filter.vendorId !== 'all') {
        query.vendorId = filter.vendorId;
      }

      const page = filter.page || 1;
      const pageSize = filter.pageSize || 20;
      const skip = (page - 1) * pageSize;

      const [data, total] = await Promise.all([
        VendorPayment.find(query).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
        VendorPayment.countDocuments(query),
      ]);

      return {
        data: data.map(mapPaymentDoc),
        total,
        page,
        pageSize,
      };
    } catch (error) {
      logger.error('Error listing vendor payments:', error);
      throw error;
    }
  }

  async getPaymentByPaymentId(paymentId) {
    try {
      const payment = await VendorPayment.findOne(mergeHubFilter({ paymentId })).lean();
      if (!payment) {
        throw new Error('Payment not found');
      }
      return mapPaymentDoc(payment);
    } catch (error) {
      logger.error('Error fetching vendor payment:', error);
      throw error;
    }
  }

  async advanceInvoiceWorkflowStep(paymentId, invoiceId, { notes }, completedBy) {
    try {
      if (!mongoose.Types.ObjectId.isValid(String(invoiceId))) {
        throw new Error('Invalid invoice id');
      }

      const payment = await VendorPayment.findOne(mergeHubFilter({ paymentId }));
      if (!payment) {
        throw new Error('Payment not found');
      }
      if (payment.overallStatus !== 'in_progress') {
        throw new Error(`Payment is ${payment.overallStatus} and cannot be advanced`);
      }

      const line = payment.invoices.find(
        (l) => l.invoiceId.toString() === String(invoiceId)
      );
      if (!line) {
        throw new Error('Invoice not part of this payment');
      }
      if (line.lineStatus !== 'in_progress') {
        throw new Error(`Invoice workflow is already ${line.lineStatus}`);
      }
      if (!isValidStep(line.currentStep)) {
        throw new Error('Invalid workflow step on invoice');
      }

      line.workflowHistory.push({
        step: line.currentStep,
        status: 'completed',
        completedAt: new Date(),
        completedBy: completedBy || 'System',
        notes: notes || undefined,
      });

      const nextStep = getNextStep(line.currentStep);
      if (nextStep) {
        line.currentStep = nextStep;
      } else {
        line.lineStatus = 'completed';
        await VendorInvoice.findOneAndUpdate(
          mergeHubFilter({ _id: line.invoiceId }),
          { $set: { status: 'paid' } }
        );
      }

      const allDone = payment.invoices.every((l) => l.lineStatus === 'completed');
      if (allDone) {
        payment.overallStatus = 'completed';
        payment.completedAt = new Date();
      }

      await payment.save();
      return mapPaymentDoc(payment);
    } catch (error) {
      logger.error('Error advancing payment workflow:', error);
      throw error;
    }
  }

  async cancelPayment(paymentId, { reason }, cancelledBy) {
    try {
      const payment = await VendorPayment.findOne(mergeHubFilter({ paymentId }));
      if (!payment) {
        throw new Error('Payment not found');
      }
      if (payment.overallStatus !== 'in_progress') {
        throw new Error(`Payment is already ${payment.overallStatus}`);
      }

      payment.overallStatus = 'cancelled';
      payment.cancelledAt = new Date();
      payment.cancelledBy = cancelledBy || 'System';
      payment.cancelReason = reason || undefined;
      payment.invoices.forEach((line) => {
        if (line.lineStatus === 'in_progress') {
          line.lineStatus = 'rejected';
          line.workflowHistory.push({
            step: line.currentStep,
            status: 'rejected',
            completedAt: new Date(),
            completedBy: cancelledBy || 'System',
            notes: reason,
          });
        }
      });
      await payment.save();

      const invoiceIds = payment.invoices.map((l) => l.invoiceId);
      await VendorInvoice.updateMany(
        mergeHubFilter({ _id: { $in: invoiceIds }, paymentId }),
        { $set: { status: 'approved' }, $unset: { paymentId: '' } }
      );

      return mapPaymentDoc(payment);
    } catch (error) {
      logger.error('Error cancelling vendor payment:', error);
      throw error;
    }
  }

  async getVendors(hubKey) {
    const effectiveHub = hubKey && String(hubKey).trim() ? String(hubKey).trim() : getDefaultHubKey();
    try {
      return await runWithVendorHub(effectiveHub, async () => {
        const result = await vendorService.listVendors({ page: 1, pageSize: 500 });
        const rows = Array.isArray(result?.data) ? result.data : [];
        return rows
          .filter((v) => {
            if (v.metadata?.deleted === true) return false;
            if (v.status === 'inactive' && v.metadata?.deleteReason) return false;
            return true;
          })
          .map((vendor) => {
            const id = vendor._id != null ? String(vendor._id) : '';
            const displayName =
              vendor.name ||
              vendor.vendorName ||
              vendor.displayName ||
              vendor.code ||
              vendor.vendorCode ||
              '';
            return {
              id,
              name: String(displayName).trim() || (id ? `Vendor ${id}` : 'Unknown Vendor'),
              email: vendor.email || vendor.contact?.email,
              accountNumber: vendor.accountNumber,
              status: vendor.status,
            };
          })
          .filter((v) => Boolean(v.id))
          .sort((a, b) => a.name.localeCompare(b.name));
      });
    } catch (error) {
      logger.error('Error fetching vendors:', error);
      throw error;
    }
  }
}

module.exports = new VendorPaymentsService();
