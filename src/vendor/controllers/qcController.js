const qcService = require('../services/qcService');

async function listQCChecks(req, res, next) {
  try {
    const result = await qcService.listQCChecks(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createQCCheck(req, res, next) {
  try {
    const check = await qcService.createQCCheck(req.body);
    res.status(201).json(check);
  } catch (err) {
    next(err);
  }
}

async function getQCCheck(req, res, next) {
  try {
    const c = await qcService.getQCCheckById(req.params.qcId);
    res.json(c);
  } catch (err) {
    next(err);
  }
}

async function patchQCCheck(req, res, next) {
  try {
    const c = await qcService.updateQCCheck(req.params.qcId, req.body);
    res.json(c);
  } catch (err) {
    next(err);
  }
}

async function overview(req, res, next) {
  try {
    res.json({ batchesCheckedToday: 0, passed: 0, failed: 0, passRate: 0, trend: [] });
  } catch (err) {
    next(err);
  }
}

module.exports = { listQCChecks, createQCCheck, getQCCheck, patchQCCheck, overview };

