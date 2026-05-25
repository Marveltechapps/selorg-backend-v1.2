const SKU = require('../models/SKU');
const Collection = require('../models/Collection');
const ErrorResponse = require('../../core/utils/ErrorResponse');

const CATALOG_REGIONS = ['North America', 'Europe (West)', 'APAC'];

// @desc    Get all SKUs
// @route   GET /api/v1/catalog/skus
const getSKUs = async (req, res, next) => {
  try {
    const skus = await SKU.find();
    res.status(200).json({ success: true, count: skus.length, data: skus });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new SKU
// @route   POST /api/v1/catalog/skus
const createSKU = async (req, res, next) => {
  try {
    const sku = await SKU.create(req.body);
    res.status(201).json({ success: true, data: sku });
  } catch (error) {
    next(error);
  }
};

// @desc    Update SKU
// @route   PUT /api/v1/catalog/skus/:id
const updateSKU = async (req, res, next) => {
  try {
    if (req.body.visibility && Object.keys(req.body).length === 1) {
      const sku = await SKU.findById(req.params.id);
      if (!sku) {
        return next(new ErrorResponse(`SKU not found with id of ${req.params.id}`, 404));
      }
      CATALOG_REGIONS.forEach((r) => {
        if (req.body.visibility[r] != null) {
          sku.visibility[r] = req.body.visibility[r];
        }
      });
      sku.markModified('visibility');
      await sku.save();
      return res.status(200).json({ success: true, data: sku });
    }

    const sku = await SKU.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!sku) {
      return next(new ErrorResponse(`SKU not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({ success: true, data: sku });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle SKU visibility for one region or all regions
// @route   PATCH /api/v1/merch/catalog/skus/:id/visibility
const patchSKUVisibility = async (req, res, next) => {
  try {
    const { region, status } = req.body;
    if (!['Visible', 'Hidden'].includes(status)) {
      return next(new ErrorResponse('status must be Visible or Hidden', 400));
    }

    const sku = await SKU.findById(req.params.id);
    if (!sku) {
      return next(new ErrorResponse(`SKU not found with id of ${req.params.id}`, 404));
    }

    if (region === 'Global') {
      CATALOG_REGIONS.forEach((r) => {
        sku.visibility[r] = status;
      });
    } else if (CATALOG_REGIONS.includes(region)) {
      sku.visibility[region] = status;
    } else {
      return next(new ErrorResponse(`Invalid region: ${region}`, 400));
    }

    sku.markModified('visibility');
    await sku.save();

    res.status(200).json({ success: true, data: sku });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete SKU
// @route   DELETE /api/v1/catalog/skus/:id
const deleteSKU = async (req, res, next) => {
  try {
    const sku = await SKU.findByIdAndDelete(req.params.id);

    if (!sku) {
      return next(new ErrorResponse(`SKU not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all Collections
// @route   GET /api/v1/catalog/collections
const getCollections = async (req, res, next) => {
  try {
    const collections = await Collection.find().populate('skus');
    res.status(200).json({ success: true, count: collections.length, data: collections });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new Collection
// @route   POST /api/v1/catalog/collections
const createCollection = async (req, res, next) => {
  try {
    const collection = await Collection.create(req.body);
    res.status(201).json({ success: true, data: collection });
  } catch (error) {
    next(error);
  }
};

// @desc    Update Collection
// @route   PUT /api/v1/catalog/collections/:id
const updateCollection = async (req, res, next) => {
  try {
    const collection = await Collection.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!collection) {
      return next(new ErrorResponse(`Collection not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({ success: true, data: collection });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete Collection
// @route   DELETE /api/v1/catalog/collections/:id
const deleteCollection = async (req, res, next) => {
  try {
    const collection = await Collection.findByIdAndDelete(req.params.id);

    if (!collection) {
      return next(new ErrorResponse(`Collection not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSKUs,
  createSKU,
  updateSKU,
  patchSKUVisibility,
  deleteSKU,
  getCollections,
  createCollection,
  updateCollection,
  deleteCollection,
};
