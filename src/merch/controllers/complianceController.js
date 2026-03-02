const mongoose = require('mongoose');
const ApprovalRequest = require('../models/ApprovalRequest');
const AuditLog = require('../../common-models/AuditLog');
const ErrorResponse = require('../../core/utils/ErrorResponse');

// @desc    Get compliance summary (pending count, audits passed, compliance score)
// @route   GET /api/v1/merch/compliance/summary
// @access  Public
const getSummary = async (req, res, next) => {
  try {
    const pendingCount = await ApprovalRequest.countDocuments({ status: 'Pending' });
    const auditsPassed = await AuditLog.countDocuments({ module: 'Compliance', severity: 'info' });
    const totalAudits = await AuditLog.countDocuments({ module: 'Compliance' });
    const complianceScore = totalAudits > 0 ? Math.round((auditsPassed / totalAudits) * 100) : 100;

    res.status(200).json({
      success: true,
      data: {
        pendingCount,
        auditsPassed,
        complianceScore,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all approval requests
// @route   GET /api/v1/compliance/approvals
// @access  Public
const getApprovals = async (req, res, next) => {
  try {
    const { status, type, riskLevel } = req.query;
    const query= {};

    if (status && status !== 'All') query.status = status;
    if (type && type !== 'all') query.type = type;
    if (riskLevel && riskLevel !== 'all') query.riskLevel = riskLevel;

    const approvals = await ApprovalRequest.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: approvals.length,
      data: approvals
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update approval status
// @route   PUT /api/v1/compliance/approvals/:id
// @access  Public
const updateApprovalStatus = async (req, res, next) => {
  try {
    const { status, user } = req.body;
    let approval = await ApprovalRequest.findById(req.params.id);

    if (!approval) {
      return next(new ErrorResponse('Approval request not found', 404));
    }

    approval.status = status;
    await approval.save();

    // Log the event
    await AuditLog.create({
      module: 'Compliance',
      action: 'Approval',
      entityType: approval.type,
      entityId: approval._id.toString(),
      userId: user && mongoose.Types.ObjectId.isValid(user) ? new mongoose.Types.ObjectId(user) : new mongoose.Types.ObjectId(),
      severity: status === 'Approved' ? 'info' : 'warning',
      details: {
        title: approval.title,
        summary: `Request ${status.toLowerCase()}`,
        region: approval.region
      }
    });

    res.status(200).json({
      success: true,
      data: approval
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all audit logs
// @route   GET /api/v1/compliance/audits
// @access  Public
const getAudits = async (req, res, next) => {
  try {
    const { search, severity, action } = req.query;
    const query= { module: 'Compliance' };

    if (severity && severity !== 'all') query.severity = severity;
    if (action && action !== 'all') query.action = action;
    if (search) {
      query.$or = [
        { entityType: { $regex: search, $options: 'i' } },
        { entityId: { $regex: search, $options: 'i' } },
        { 'details.summary': { $regex: search, $options: 'i' } }
      ];
    }

    const audits = await AuditLog.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: audits.length,
      data: audits
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Seed Compliance Data
// @route   POST /api/v1/compliance/seed
// @access  Private
const seedComplianceData = async (req, res, next) => {
  try {
    const mockApprovals = [
      {
        type: 'Price Change',
        title: 'Coffee Beans 1kg',
        description: '$25.00 → $28.00',
        requestedBy: 'John D.',
        riskLevel: 'Low',
        region: 'North America',
        details: { sku: 'SKU-CB-001', currentPrice: 25, proposedPrice: 28 },
        slaDeadline: new Date(Date.now() + 4 * 3600000)
      },
      {
        type: 'New Campaign',
        title: 'Winter Warmers',
        description: 'Bundle Discount',
        requestedBy: 'Sarah M.',
        riskLevel: 'Medium',
        region: 'Europe',
        details: { campaignName: 'Winter Warmers 2024', discountMechanics: 'Buy 2 Get 1 Free' },
        slaDeadline: new Date(Date.now() + 2 * 3600000)
      }
    ];

    const mockAudits = Array.from({ length: 22 }).map((_, i) => ({
      module: 'Compliance',
      action: i % 5 === 0 ? 'Violation' : 'Approval',
      entityType: `Entity #${100 + i}`,
      entityId: `${100 + i}`,
      userId: new mongoose.Types.ObjectId(),
      severity: i % 5 === 0 ? 'error' : 'info',
      details: {
        summary: i % 5 === 0 ? 'Policy breach detected' : 'Standard check passed',
        scope: i % 3 === 0 ? 'Global' : 'Regional'
      },
      createdAt: new Date(Date.now() - i * 3600000)
    }));

    await ApprovalRequest.deleteMany({});
    await AuditLog.deleteMany({});
    
    await ApprovalRequest.insertMany(mockApprovals);
    await AuditLog.insertMany(mockAudits);

    res.status(201).json({
      success: true,
      message: 'Compliance data seeded successfully'
    });
  } catch (err) {
    next(err);
  }
};


module.exports = {
  getSummary,
  getApprovals,
  updateApprovalStatus,
  getAudits,
  seedComplianceData
};
