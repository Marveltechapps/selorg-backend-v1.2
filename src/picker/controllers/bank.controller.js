/**
 * Bank controller – from frontend YAML (bank.service.ts endpoints).
 */
const bankService = require('../services/bank.service');
const { success, error } = require('../utils/response.util');
const { invalidatePickerCache } = require('../cacheInvalidation');

const verify = async (req, res, next) => {
  try {
    const result = await bankService.verify(req.body);
    res.status(200).json({ ...result });
  } catch (err) {
    next(err);
  }
};

const listAccounts = async (req, res, next) => {
  try {
    const data = await bankService.listByUser(req.userId);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

const createAccount = async (req, res, next) => {
  try {
    const data = await bankService.create(req.userId, req.body);
    if (!data) return error(res, 'Unable to save bank account', 400);
    await invalidatePickerCache();
    success(res, data, 201);
  } catch (err) {
    next(err);
  }
};

const updateAccount = async (req, res, next) => {
  try {
    const data = await bankService.update(req.userId, req.params.accountId, req.body);
    if (!data) return error(res, 'Not found', 404);
    await invalidatePickerCache();
    success(res, data);
  } catch (err) {
    next(err);
  }
};

const setDefault = async (req, res, next) => {
  try {
    const data = await bankService.setDefault(req.userId, req.params.accountId);
    if (!data) return error(res, 'Not found', 404);
    await invalidatePickerCache();
    success(res, data);
  } catch (err) {
    next(err);
  }
};

const deleteAccount = async (req, res, next) => {
  try {
    const ok = await bankService.remove(req.userId, req.params.accountId);
    if (!ok) return error(res, 'Not found', 404);
    await invalidatePickerCache();
    success(res, {});
  } catch (err) {
    next(err);
  }
};

module.exports = {
  verify,
  listAccounts,
  createAccount,
  updateAccount,
  setDefault,
  deleteAccount,
};
