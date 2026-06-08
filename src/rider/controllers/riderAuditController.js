const riderAuditService = require('../services/riderAuditService');

async function list(req, res, next) {
  try {
    const { page, limit, action, entityType } = req.query;
    const data = await riderAuditService.listRiderOpsAudit({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      action,
      entityType,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
