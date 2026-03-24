const mongoose = require('mongoose');
const vendorService = require('../services/vendorService');
const vendorMetricsService = require('../services/vendorMetricsService');
const purchaseOrderService = require('../services/purchaseOrderService');
const qcService = require('../services/qcService');
const alertService = require('../services/alertService');
const { validationResult } = require('express-validator');
const PurchaseOrder = require('../models/PurchaseOrder');
const Alert = require('../models/Alert');
const GRN = require('../models/GRN');
const VendorRating = require('../models/VendorRating');
const { mergeHubFilter } = require('../constants/hubScope');
const emailService = require('../services/emailService');
const inviteService = require('../services/inviteService');

async function createVendor(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ code: 400, message: 'Validation error', details: errors.array() });
    const vendor = await vendorService.createVendor(req.body);
    res.status(201).json(vendor);
  } catch (err) {
    // Mongoose duplicate key (e.g. unique sparse index collisions) can otherwise bubble up as 500.
    if (err && (err.code === 11000 || err.name === 'MongoServerError')) {
      return res.status(409).json({
        code: 409,
        message: err.message || 'Vendor already exists',
      });
    }
    if (err.status === 400 || err.status === 409) {
      return res.status(err.status).json({ code: err.status, message: err.message });
    }
    next(err);
  }
}

async function listVendors(req, res, next) {
  try {
    const result = await vendorService.listVendors(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getVendor(req, res, next) {
  try {
    const vendor = await vendorService.getVendorById(req.params.vendorId);
    res.json(vendor);
  } catch (err) {
    next(err);
  }
}

async function putVendor(req, res, next) {
  try {
    const vendor = await vendorService.updateVendor(req.params.vendorId, req.body);
    res.json(vendor);
  } catch (err) {
    next(err);
  }
}

async function patchVendor(req, res, next) {
  try {
    const vendor = await vendorService.patchVendor(req.params.vendorId, req.body);
    res.json(vendor);
  } catch (err) {
    next(err);
  }
}

async function postAction(req, res, next) {
  try {
    const result = await vendorService.performAction(req.params.vendorId, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listVendorPurchaseOrders(req, res, next) {
  try {
    const query = Object.assign({}, req.query, { vendorId: req.params.vendorId });
    const result = await purchaseOrderService.listPurchaseOrders(query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listVendorQCChecks(req, res, next) {
  try {
    const query = Object.assign({}, req.query, { vendorId: req.params.vendorId });
    const result = await qcService.listQCChecks(query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createVendorQCCheck(req, res, next) {
  try {
    const payload = Object.assign({}, req.body, { vendorId: req.params.vendorId });
    const created = await qcService.createQCCheck(payload);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

async function listVendorAlerts(req, res, next) {
  try {
    const result = await alertService.listAlerts({ vendorId: req.params.vendorId, ...req.query });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createVendorAlert(req, res, next) {
  try {
    const payload = Object.assign({}, req.body, { vendorId: req.params.vendorId });
    const created = await alertService.createAlert(payload);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

async function getVendorPerformance(req, res, next) {
  try {
    const { startDate, endDate, resolution } = req.query;
    const metrics = await vendorMetricsService.getPerformance(req.params.vendorId, { startDate, endDate, resolution });
    res.json(metrics);
  } catch (err) {
    next(err);
  }
}

async function getVendorHealth(req, res, next) {
  try {
    const health = await vendorMetricsService.getHealth(req.params.vendorId);
    res.json(health);
  } catch (err) {
    next(err);
  }
}

async function getVendorSummary(req, res, next) {
  try {
    const Vendor = require('../models/Vendor');
    const Shipment = require('../models/Shipment');
    const QCCheck = require('../models/QCCheck');
    const Certificate = require('../models/Certificate');

    const activeVendors = await Vendor.countDocuments(mergeHubFilter({ status: 'active' }));
    const totalVendors = await Vendor.countDocuments(mergeHubFilter({}));
    const pendingVendors = await Vendor.countDocuments(
      mergeHubFilter({
        status: { $in: ['pending', 'under_review'] },
      })
    );

    const totalDeliveries = await Shipment.countDocuments(
      mergeHubFilter({
        estimatedArrival: { $exists: true, $ne: null },
        deliveredAt: { $exists: true, $ne: null },
      })
    );
    const onTimeDeliveries = await Shipment.countDocuments(
      mergeHubFilter({
        estimatedArrival: { $exists: true, $ne: null },
        deliveredAt: { $exists: true, $ne: null },
        $expr: { $lte: ['$deliveredAt', '$estimatedArrival'] },
      })
    );
    const deliveryTimeliness =
      totalDeliveries === 0
        ? null
        : Math.round((onTimeDeliveries / totalDeliveries) * 1000) / 10;

    const totalQC = await QCCheck.countDocuments(mergeHubFilter({}));
    const passedQC = await QCCheck.countDocuments(
      mergeHubFilter({
        status: { $in: ['approved', 'passed', 'pass', 'APPROVED', 'PASSED', 'PASS'] },
      })
    );
    const rejectedQC = await QCCheck.countDocuments(
      mergeHubFilter({
        status: { $in: ['rejected', 'failed', 'fail', 'REJECTED', 'FAILED', 'FAIL'] },
      })
    );
    const productQuality =
      totalQC === 0 ? null : Math.round((passedQC / totalQC) * 1000) / 10;
    const rejectionRate =
      totalQC === 0 ? null : Math.round((rejectedQC / totalQC) * 1000) / 10;

    const vendorsWithValidDocs = await Certificate.distinct('vendorId', mergeHubFilter({ status: 'valid' }));
    const complianceStatus =
      activeVendors === 0
        ? null
        : Math.round((vendorsWithValidDocs.length / activeVendors) * 1000) / 10;

    const totalGRNs = await GRN.countDocuments(mergeHubFilter({}));
    const approvedGRNs = await GRN.countDocuments(mergeHubFilter({ status: 'APPROVED' }));
    const slaCompliance =
      totalGRNs === 0 ? null : Math.round((approvedGRNs / totalGRNs) * 1000) / 10;

    const openPOStatuses = [
      'pending_approval',
      'approved',
      'sent',
      'on_hold',
      'partially_received',
    ];
    const openPOFilter = {
      archived: { $ne: true },
      status: { $in: openPOStatuses },
    };
    const openPOs = await PurchaseOrder.countDocuments(mergeHubFilter(openPOFilter));
    const openPOAgg = await PurchaseOrder.aggregate([
      { $match: mergeHubFilter(openPOFilter) },
      { $group: { _id: null, value: { $sum: { $ifNull: ['$totals.grandTotal', 0] } } } },
    ]);
    const openPOValue =
      openPOAgg.length && openPOAgg[0].value != null ? openPOAgg[0].value : 0;

    const criticalAlerts = await Alert.countDocuments(
      mergeHubFilter({
        status: 'open',
        severity: 'critical',
      })
    );

    const respondedPOs = await PurchaseOrder.find(
      mergeHubFilter({
        status: {
          $in: ['approved', 'sent', 'partially_received', 'fully_received'],
        },
      })
    )
      .select('createdAt updatedAt')
      .lean();
    let avgPOResponseHours = null;
    if (respondedPOs.length > 0) {
      let sumH = 0;
      let n = 0;
      for (const p of respondedPOs) {
        const ms = new Date(p.updatedAt) - new Date(p.createdAt);
        if (ms >= 0) {
          sumH += ms / (1000 * 60 * 60);
          n += 1;
        }
      }
      if (n > 0) avgPOResponseHours = Math.round((sumH / n) * 10) / 10;
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    const recentShipments = await Shipment.find(
      mergeHubFilter({
        deliveredAt: { $gte: thirtyDaysAgo, $exists: true, $ne: null },
        estimatedArrival: { $exists: true, $ne: null },
      })
    )
      .select('deliveredAt estimatedArrival')
      .lean();

    const byDay = new Map();
    for (const s of recentShipments) {
      if (!s.deliveredAt) continue;
      const day = new Date(s.deliveredAt).toISOString().slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, { total: 0, onTime: 0 });
      const b = byDay.get(day);
      b.total += 1;
      if (new Date(s.deliveredAt) <= new Date(s.estimatedArrival)) b.onTime += 1;
    }
    const slaTrend = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        sla: Math.round((v.onTime / v.total) * 1000) / 10,
      }));

    const topRated = await VendorRating.find(mergeHubFilter({}))
      .sort({ overallRating: -1 })
      .limit(5)
      .lean();
    const topIds = topRated.map((r) => r.vendorId).filter(Boolean);
    let topPerformers = [];
    if (topIds.length) {
      const oidIds = topIds
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      if (oidIds.length) {
        const named = await Vendor.find(mergeHubFilter({ _id: { $in: oidIds } }))
          .select('name vendorName')
          .lean();
        const nameById = Object.fromEntries(
          named.map((v) => [String(v._id), v.vendorName || v.name])
        );
        topPerformers = topIds
          .map((id) => nameById[id])
          .filter((n) => typeof n === 'string' && n.length > 0);
      }
    }

    res.json({
      activeVendors,
      totalVendors,
      pendingVendors,
      slaCompliance,
      openPOs,
      openPOValue,
      criticalAlerts,
      deliveryTimeliness,
      productQuality,
      complianceStatus,
      rejectionRate,
      avgPOResponseHours,
      topPerformers,
      slaTrend,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

async function sendInviteEmail(req, res, next) {
  try {
    const { vendorId, personalMessage, expiryDays } = req.body;

    const Vendor = require('../models/Vendor');
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    if (!vendor.contact?.email) {
      return res.status(400).json({
        error: 'Vendor has no email address',
      });
    }

    const { token } = await inviteService.createInviteToken(
      vendorId,
      expiryDays || 7
    );

    const frontendUrl =
      process.env.FRONTEND_URL || 'http://localhost:5173';
    const inviteLink = `${frontendUrl}/vendor-signup?token=${token}`;

    const result = await emailService.sendEmail({
      to: vendor.contact.email,
      templateName: 'vendor_invite',
      templateData: {
        vendorName: vendor.name,
        inviteLink,
        expiryDays: expiryDays || 7,
        personalMessage: personalMessage || '',
        category: vendor.metadata?.category || '',
        companyName: process.env.COMPANY_NAME || 'Selorg',
      },
    });

    vendor.status = 'invited';
    vendor.stage = 'invited';
    if (!vendor.metadata) vendor.metadata = {};
    vendor.metadata.inviteSentAt = new Date().toISOString();
    if (result.previewUrl) {
      vendor.metadata.inviteEmailPreviewUrl = result.previewUrl;
    }
    vendor.markModified('metadata');
    await vendor.save();

    res.json({
      success: true,
      message: `Invite sent to ${vendor.contact.email}`,
      previewUrl: result.previewUrl || null,
    });
  } catch (err) {
    next(err);
  }
}

async function sendDocumentRequestEmail(req, res, next) {
  try {
    const { vendorId, requiredDocs, deadline, notes } = req.body;
    const Vendor = require('../models/Vendor');
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const frontendUrl =
      process.env.FRONTEND_URL || 'http://localhost:5173';

    const result = await emailService.sendEmail({
      to: vendor.contact?.email,
      templateName: 'document_request',
      templateData: {
        vendorName: vendor.name,
        requiredDocs: requiredDocs || [],
        deadline,
        notes,
        dashboardLink: `${frontendUrl}/vendor-signup?token=${vendor.metadata?.inviteToken || ''}`,
        requestedBy: 'Selorg Team',
      },
    });

    res.json({
      success: true,
      message: 'Document request email sent',
      previewUrl: result.previewUrl || null,
    });
  } catch (err) {
    next(err);
  }
}

async function sendPaymentEmail(req, res, next) {
  try {
    const {
      vendorId,
      amount,
      referenceNumber,
      invoiceNumbers,
      paymentMethod,
    } = req.body;
    const Vendor = require('../models/Vendor');
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const result = await emailService.sendEmail({
      to: vendor.contact?.email,
      templateName: 'payment_notification',
      templateData: {
        vendorName: vendor.name,
        amount,
        paymentDate: new Date().toLocaleDateString('en-IN'),
        referenceNumber,
        bankAccount: vendor.metadata?.bankAccount,
        invoiceNumbers,
        paymentMethod: paymentMethod || 'NEFT',
      },
    });

    res.json({
      success: true,
      message: 'Payment email sent',
      previewUrl: result.previewUrl || null,
    });
  } catch (err) {
    next(err);
  }
}

async function sendRejectionEmail(req, res, next) {
  try {
    const { vendorId, rejectionReason, canReapply, reapplyAfterDays } =
      req.body;
    const Vendor = require('../models/Vendor');
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const result = await emailService.sendEmail({
      to: vendor.contact?.email,
      templateName: 'rejection',
      templateData: {
        vendorName: vendor.name,
        rejectionReason,
        canReapply: canReapply || false,
        reapplyAfterDays: reapplyAfterDays || 30,
        contactEmail: process.env.SUPPORT_EMAIL || 'vendor@selorg.com',
      },
    });

    vendor.status = 'rejected';
    vendor.stage = 'rejected';
    await vendor.save();

    res.json({
      success: true,
      message: 'Rejection email sent',
      previewUrl: result.previewUrl || null,
    });
  } catch (err) {
    next(err);
  }
}

async function getEmailTemplatePreview(req, res, next) {
  try {
    const { templateName } = req.params;

    const SAMPLE = {
      vendorName: 'FreshMart Suppliers',
      inviteLink: 'http://localhost:5173/vendor-signup?token=sample',
      expiryDays: 7,
      companyName: 'Selorg',
      personalMessage: 'We would love you as our dairy supplier.',
      category: 'Dairy / Perishables',
      requiredDocs: ['FSSAI License', 'GST Certificate'],
      deadline: '30 Mar 2026',
      dashboardLink: 'http://localhost:5173/vendor-signup',
      poNumber: 'PO-2026-001',
      poDate: '23 Mar 2026',
      items: [{ sku: 'MILK-1L', qty: 100, unit: 'L', unitPrice: 22 }],
      totalValue: 2200,
      deliveryDate: '25 Mar 2026',
      warehouseAddress: 'Anna Nagar Darkstore, Chennai',
      amount: 15000,
      paymentDate: '23 Mar 2026',
      referenceNumber: 'REF-2026-123',
      paymentMethod: 'NEFT',
      bankAccount: '9876543210',
      invoiceNumbers: ['INV-001', 'INV-002'],
      contractId: 'CONTRACT-2026-001',
      validFrom: '01 Apr 2026',
      validTo: '31 Mar 2027',
      signDeadline: '30 Mar 2026',
      contractLink: 'http://localhost:5173/contract/sample',
      keyTerms: ['Net 15 payment terms', 'Weekly PO cycle'],
      rejectionReason: 'Documentation incomplete',
      canReapply: true,
      reapplyAfterDays: 30,
      contactEmail: 'vendor@selorg.com',
    };

    const templates = {
      vendor_invite: emailService.getVendorInviteTemplate,
      document_request: emailService.getDocumentRequestTemplate,
      po_confirmation: emailService.getPOConfirmationTemplate,
      payment_notification: emailService.getPaymentNotificationTemplate,
      contract_sent: emailService.getContractSentTemplate,
      rejection: emailService.getRejectionTemplate,
    };

    const fn = templates[templateName];
    if (!fn) return res.status(404).json({ error: 'Template not found' });

    const { htmlBody } = fn(SAMPLE);
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlBody);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createVendor,
  listVendors,
  getVendor,
  putVendor,
  patchVendor,
  postAction,
  listVendorPurchaseOrders,
  listVendorQCChecks,
  createVendorQCCheck,
  listVendorAlerts,
  createVendorAlert,
  getVendorPerformance,
  getVendorHealth,
  getVendorSummary,
  sendInviteEmail,
  sendDocumentRequestEmail,
  sendPaymentEmail,
  sendRejectionEmail,
  getEmailTemplatePreview,
};

