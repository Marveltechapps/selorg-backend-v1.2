/**
 * Darkstore Issue controller – picker issues management
 * GET /api/v1/darkstore/issues – list with filters
 * GET /api/v1/darkstore/issues/ops-users – list ops users for assign dropdown
 * GET /api/v1/darkstore/issues/:id – get issue details
 * PATCH /api/v1/darkstore/issues/:id – assign or close
 */
const PickerIssue = require('../../picker/models/issue.model');
const PickerUser = require('../../picker/models/user.model');
const User = require('../../admin/models/User');

async function listIssues(req, res, next) {
  try {
    const { site, severity, status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const query = {};
    if (site) query.storeId = site;
    if (severity) query.severity = severity;
    if (status) query.status = status;

    const [issues, total] = await Promise.all([
      PickerIssue.find(query)
        .populate('pickerId', 'name phone currentLocationId')
        .sort({ reportedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      PickerIssue.countDocuments(query),
    ]);

    const data = issues.map((i) => {
      const picker = i.pickerId;
      return {
        id: i._id.toString(),
        pickerId: i.pickerId?._id?.toString() || i.pickerId?.toString(),
        pickerName: picker?.name || picker?.phone || '—',
        issueType: i.issueType,
        orderId: i.orderId,
        description: i.description,
        imageUrl: i.imageUrl,
        severity: i.severity,
        status: i.status,
        reportedAt: i.reportedAt,
        assignedTo: i.assignedTo,
        closedAt: i.closedAt,
        storeId: i.storeId,
      };
    });

    res.json({
      success: true,
      data,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (err) {
    next(err);
  }
}

async function getIssueById(req, res, next) {
  try {
    const { id } = req.params;
    const issue = await PickerIssue.findById(id)
      .populate('pickerId', 'name phone currentLocationId')
      .lean();

    if (!issue) {
      return res.status(404).json({
        success: false,
        error: { message: 'Issue not found' },
      });
    }

    const picker = issue.pickerId;
    res.json({
      success: true,
      data: {
        id: issue._id.toString(),
        pickerId: issue.pickerId?._id?.toString() || issue.pickerId?.toString(),
        pickerName: picker?.name || picker?.phone || '—',
        pickerPhone: picker?.phone,
        issueType: issue.issueType,
        orderId: issue.orderId,
        description: issue.description,
        imageUrl: issue.imageUrl,
        severity: issue.severity,
        status: issue.status,
        reportedAt: issue.reportedAt,
        assignedTo: issue.assignedTo,
        closedAt: issue.closedAt,
        storeId: issue.storeId,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getOpsUsers(req, res, next) {
  try {
    const users = await User.find({
      role: { $in: ['darkstore', 'admin', 'super_admin'] },
    })
      .select('_id name email')
      .sort({ name: 1 })
      .lean();

    res.json({
      success: true,
      data: users.map((u) => ({
        id: u._id.toString(),
        name: u.name || u.email || u._id.toString(),
        email: u.email,
      })),
    });
  } catch (err) {
    next(err);
  }
}

async function updateIssue(req, res, next) {
  try {
    const { id } = req.params;
    const { action, assignedTo } = req.body;
    const actorId = req.user?.userId || req.user?.id;

    if (!action || !['assign', 'close'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: { message: 'action must be "assign" or "close"' },
      });
    }

    const issue = await PickerIssue.findById(id);
    if (!issue) {
      return res.status(404).json({
        success: false,
        error: { message: 'Issue not found' },
      });
    }

    if (action === 'assign') {
      if (!assignedTo) {
        return res.status(400).json({
          success: false,
          error: { message: 'assignedTo is required for assign action' },
        });
      }
      issue.status = 'assigned';
      issue.assignedTo = assignedTo;
    } else if (action === 'close') {
      issue.status = 'closed';
      issue.closedAt = new Date();
      issue.assignedTo = issue.assignedTo || (typeof actorId === 'string' ? actorId : actorId?.toString?.());
    }

    await issue.save();

    const populated = await PickerIssue.findById(id)
      .populate('pickerId', 'name phone currentLocationId')
      .lean();
    const picker = populated.pickerId;

    res.json({
      success: true,
      data: {
        id: populated._id.toString(),
        pickerId: populated.pickerId?._id?.toString() || populated.pickerId?.toString(),
        pickerName: picker?.name || picker?.phone || '—',
        issueType: populated.issueType,
        orderId: populated.orderId,
        description: populated.description,
        imageUrl: populated.imageUrl,
        severity: populated.severity,
        status: populated.status,
        reportedAt: populated.reportedAt,
        assignedTo: populated.assignedTo,
        closedAt: populated.closedAt,
        storeId: populated.storeId,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listIssues,
  getIssueById,
  getOpsUsers,
  updateIssue,
};
