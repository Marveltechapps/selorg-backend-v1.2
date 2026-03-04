/**
 * Picker Issue controller – POST /api/v1/picker/issues
 */
const issueService = require('../services/issue.service');
const s3Service = require('../services/s3.service');
const websocketService = require('../../utils/websocket');

const ISSUE_TYPES = ['item_damaged', 'inventory_mismatch', 'shelf_empty', 'app_bug', 'device_issue'];

async function reportIssue(req, res, next) {
  try {
    const pickerId = req.userId;
    if (!pickerId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    let imageUrl = req.body.imageUrl;
    if (!imageUrl && req.file && req.file.buffer) {
      const mimetype = req.file.mimetype || 'image/jpeg';
      const ext = mimetype === 'image/png' ? 'png' : 'jpg';
      const key = `picker-issues/${pickerId}/${Date.now()}.${ext}`;
      try {
        imageUrl = await s3Service.uploadDocument(req.file.buffer, mimetype, key);
      } catch (s3Err) {
        // Continue without image if S3 fails
        imageUrl = null;
      }
    }

    const issueType = req.body.issueType;
    const description = req.body.description;
    const orderId = req.body.orderId;
    const severity = req.body.severity;

    if (!issueType || !description) {
      return res.status(400).json({
        success: false,
        error: 'issueType and description are required',
      });
    }
    if (!ISSUE_TYPES.includes(issueType)) {
      return res.status(400).json({
        success: false,
        error: `issueType must be one of: ${ISSUE_TYPES.join(', ')}`,
      });
    }

    const issue = await issueService.createIssue(pickerId, {
      issueType,
      orderId,
      description,
      imageUrl,
      severity,
    });

    try {
      const { logPickerAction } = require('../services/pickerActionLog.service');
      await logPickerAction({
        actionType: 'issue_report',
        pickerId: String(pickerId),
        orderId: orderId || undefined,
        metadata: { issueType, severity, issueId: issue._id?.toString?.() },
      });
    } catch (_) {}

    if (websocketService && websocketService.broadcastToRole) {
      websocketService.broadcastToRole('darkstore', 'ISSUE_REPORTED', {
        issueId: issue._id.toString(),
        pickerId: pickerId.toString(),
        issueType,
        orderId,
        description,
        imageUrl,
        reportedAt: issue.reportedAt,
        storeId: issue.storeId,
      });
    }

    res.status(201).json({
      success: true,
      data: {
        id: issue._id.toString(),
        issueType: issue.issueType,
        orderId: issue.orderId,
        description: issue.description,
        imageUrl: issue.imageUrl,
        status: issue.status,
        reportedAt: issue.reportedAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { reportIssue };
