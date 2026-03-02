/**
 * Sample controller – HTTP layer
 */
const sampleService = require('../services/sample.service');
const { success, error } = require('../utils/response.util');

const getAll = async (req, res, next) => {
  try {
    const data = await sampleService.getAll();
    success(res, data);
  } catch (err) {
    next(err);
  }
};

const getById = async (req, res, next) => {
  try {
    const data = await sampleService.getById(req.params.id);
    if (!data) return error(res, 'Not found', 404);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const data = await sampleService.create(req.body);
    success(res, data, 201);
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getById, create };
