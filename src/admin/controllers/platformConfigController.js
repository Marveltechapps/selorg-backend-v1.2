const ResponseFormatter = require('../../core/utils/ResponseFormatter');
const platformConfigService = require('../../platform/services/platformConfigService');

function actor(req) {
  return String(req.user?.userId || req.user?.email || '');
}

exports.list = async (req, res, next) => {
  try {
    const prefix = req.query.prefix ? String(req.query.prefix) : undefined;
    const items = await platformConfigService.listConfigs({ prefix });
    res.json(ResponseFormatter.success(items, 'Platform configs loaded'));
  } catch (err) {
    next(err);
  }
};

exports.getOne = async (req, res, next) => {
  try {
    const { key } = req.params;
    const doc = await platformConfigService.getConfigDoc(key);
    if (!doc) {
      res.status(404).json(ResponseFormatter.notFound('PlatformConfig', key));
      return;
    }
    res.json(ResponseFormatter.success(doc, 'OK'));
  } catch (err) {
    next(err);
  }
};

exports.upsert = async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value, valueType, description } = req.body || {};
    const doc = await platformConfigService.upsertConfig(
      key,
      { value, valueType, description },
      actor(req)
    );
    res.json(ResponseFormatter.success(doc, 'Config saved'));
  } catch (err) {
    if (err.statusCode === 400) {
      res.status(400).json(ResponseFormatter.validationError([{ field: 'key', message: err.message }]));
      return;
    }
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const { key } = req.params;
    await platformConfigService.deleteConfig(key);
    res.json(ResponseFormatter.success({ key }, 'Config deleted'));
  } catch (err) {
    if (err.statusCode === 400) {
      res.status(400).json(ResponseFormatter.validationError([{ field: 'key', message: err.message }]));
      return;
    }
    next(err);
  }
};
