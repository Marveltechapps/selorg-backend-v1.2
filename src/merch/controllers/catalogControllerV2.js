const CatalogService = require('../services/catalogService');
const CatalogVersion = require('../models/CatalogVersion');
const ProductAttribute = require('../models/ProductAttribute');
const ProductTaxonomy = require('../models/ProductTaxonomy');
const BulkImportJob = require('../models/BulkImportJob');
const ErrorResponse = require('../../core/utils/ErrorResponse');

// ===== CATALOG VERSIONING =====

const createCatalogVersion = async (req, res, next) => {
  try {
    const result = await CatalogService.createCatalogVersion(req.body);
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }
    
    res.status(201).json({
      success: true,
      data: result.version
    });
  } catch (error) {
    next(error);
  }
};

const getCatalogVersion = async (req, res, next) => {
  try {
    const { versionNumber } = req.params;
    
    const result = await CatalogService.getCatalogVersion(parseInt(versionNumber));
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 404));
    }
    
    res.status(200).json({
      success: true,
      data: result.version
    });
  } catch (error) {
    next(error);
  }
};

const getVersionHistory = async (req, res, next) => {
  try {
    const { limit = 20 } = req.query;
    
    const result = await CatalogService.getVersionHistory(parseInt(limit));
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }
    
    res.status(200).json({
      success: true,
      count: result.count,
      data: result.versions
    });
  } catch (error) {
    next(error);
  }
};

const compareVersions = async (req, res, next) => {
  try {
    const { version1, version2 } = req.params;
    
    const result = await CatalogService.compareVersions(parseInt(version1), parseInt(version2));
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 404));
    }
    
    res.status(200).json({
      success: true,
      data: result.comparison
    });
  } catch (error) {
    next(error);
  }
};

// ===== PRODUCT ATTRIBUTES =====

const createAttribute = async (req, res, next) => {
  try {
    const result = await CatalogService.createAttribute(req.body);
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }
    
    res.status(201).json({
      success: true,
      data: result.attribute
    });
  } catch (error) {
    next(error);
  }
};

const updateAttribute = async (req, res, next) => {
  try {
    const { attributeId } = req.params;
    
    const result = await CatalogService.updateAttribute(attributeId, req.body);
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 404));
    }
    
    res.status(200).json({
      success: true,
      data: result.attribute
    });
  } catch (error) {
    next(error);
  }
};

const getActiveAttributes = async (req, res, next) => {
  try {
    const result = await CatalogService.getActiveAttributes();
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }
    
    res.status(200).json({
      success: true,
      count: result.count,
      data: result.attributes
    });
  } catch (error) {
    next(error);
  }
};

const getFacetAttributes = async (req, res, next) => {
  try {
    const result = await CatalogService.getFacetAttributes();
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }
    
    res.status(200).json({
      success: true,
      count: result.count,
      data: result.attributes
    });
  } catch (error) {
    next(error);
  }
};

const validateAttributeValue = async (req, res, next) => {
  try {
    const { attributeId } = req.params;
    const { value } = req.body;
    
    const result = await CatalogService.validateAttributeValue(attributeId, value);
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 404));
    }
    
    res.status(200).json({
      success: true,
      isValid: result.isValid,
      attribute: result.attribute
    });
  } catch (error) {
    next(error);
  }
};

// ===== PRODUCT TAXONOMY =====

const createTaxonomy = async (req, res, next) => {
  try {
    const result = await CatalogService.createTaxonomy(req.body);
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }
    
    res.status(201).json({
      success: true,
      data: result.taxonomy
    });
  } catch (error) {
    next(error);
  }
};

const getTaxonomyHierarchy = async (req, res, next) => {
  try {
    const result = await CatalogService.getTaxonomyHierarchy();
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }
    
    res.status(200).json({
      success: true,
      data: result.hierarchy
    });
  } catch (error) {
    next(error);
  }
};

const getTaxonomyPath = async (req, res, next) => {
  try {
    const { taxonomyId } = req.params;
    
    const result = await CatalogService.getTaxonomyPath(taxonomyId);
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 404));
    }
    
    res.status(200).json({
      success: true,
      path: result.path,
      breadcrumb: result.breadcrumb
    });
  } catch (error) {
    next(error);
  }
};

const updateTaxonomyMetadata = async (req, res, next) => {
  try {
    const { taxonomyId } = req.params;
    
    const result = await CatalogService.updateTaxonomyMetadata(taxonomyId, req.body);
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 404));
    }
    
    res.status(200).json({
      success: true,
      data: result.taxonomy
    });
  } catch (error) {
    next(error);
  }
};

// ===== BULK IMPORT =====

const createBulkImportJob = async (req, res, next) => {
  try {
    const result = await CatalogService.createBulkImportJob(req.body);
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }
    
    res.status(201).json({
      success: true,
      data: result.job
    });
  } catch (error) {
    next(error);
  }
};

const getImportJobStatus = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    
    const result = await CatalogService.getImportJobStatus(jobId);
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 404));
    }
    
    res.status(200).json({
      success: true,
      status: result.status,
      progress: result.progress,
      errorCount: result.errorCount,
      data: result.job
    });
  } catch (error) {
    next(error);
  }
};

const updateImportProgress = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    
    const result = await CatalogService.updateImportProgress(jobId, req.body);
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 404));
    }
    
    res.status(200).json({
      success: true,
      data: result.job
    });
  } catch (error) {
    next(error);
  }
};

const addImportError = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    
    const result = await CatalogService.addImportError(jobId, req.body);
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 404));
    }
    
    res.status(200).json({
      success: true,
      data: result.job
    });
  } catch (error) {
    next(error);
  }
};

const completeImportJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const { results } = req.body;
    
    const result = await CatalogService.completeImportJob(jobId, results);
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 404));
    }
    
    res.status(200).json({
      success: true,
      data: result.job
    });
  } catch (error) {
    next(error);
  }
};

const getImportJobsInProgress = async (req, res, next) => {
  try {
    const result = await CatalogService.getImportJobsInProgress();
    
    if (!result.success) {
      return next(new ErrorResponse(result.error, 400));
    }
    
    res.status(200).json({
      success: true,
      count: result.count,
      data: result.jobs
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCatalogVersion,
  getCatalogVersion,
  getVersionHistory,
  compareVersions,
  createAttribute,
  updateAttribute,
  getActiveAttributes,
  getFacetAttributes,
  validateAttributeValue,
  createTaxonomy,
  getTaxonomyHierarchy,
  getTaxonomyPath,
  updateTaxonomyMetadata,
  createBulkImportJob,
  getImportJobStatus,
  updateImportProgress,
  addImportError,
  completeImportJob,
  getImportJobsInProgress
};
