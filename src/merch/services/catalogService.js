const CatalogVersion = require('../models/CatalogVersion');
const ProductAttribute = require('../models/ProductAttribute');
const ProductTaxonomy = require('../models/ProductTaxonomy');
const BulkImportJob = require('../models/BulkImportJob');
const InventoryTransaction = require('../models/InventoryTransaction');

class CatalogService {
  // ==== CATALOG VERSIONING ====
  
  static async createCatalogVersion(data) {
    try {
      const version = await CatalogVersion.createNewVersion(data);
      
      return {
        success: true,
        version
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async getCatalogVersion(versionNumber) {
    try {
      const version = await CatalogVersion.findOne({ version: versionNumber });
      
      if (!version) {
        return {
          success: false,
          error: 'Catalog version not found'
        };
      }
      
      return {
        success: true,
        version
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async getVersionHistory(limit = 20) {
    try {
      const versions = await CatalogVersion.find()
        .sort({ version: -1 })
        .limit(limit);
      
      return {
        success: true,
        count: versions.length,
        versions
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async compareVersions(version1, version2) {
    try {
      const v1 = await CatalogVersion.findOne({ version: version1 });
      const v2 = await CatalogVersion.findOne({ version: version2 });
      
      if (!v1 || !v2) {
        return {
          success: false,
          error: 'One or both versions not found'
        };
      }
      
      const diff = v1.getVersionDiff(v2);
      
      return {
        success: true,
        comparison: {
          version1: v1.version,
          version2: v2.version,
          diff
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ==== PRODUCT ATTRIBUTES ====
  
  static async createAttribute(data) {
    try {
      // Generate slug from name if not provided
      if (!data.slug) {
        data.slug = data.name
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^\w-]/g, '');
      }
      
      const attribute = await ProductAttribute.create(data);
      
      return {
        success: true,
        attribute
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async updateAttribute(attributeId, updates) {
    try {
      const attribute = await ProductAttribute.findByIdAndUpdate(
        attributeId,
        updates,
        { new: true, runValidators: true }
      );
      
      if (!attribute) {
        return {
          success: false,
          error: 'Attribute not found'
        };
      }
      
      return {
        success: true,
        attribute
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async getActiveAttributes() {
    try {
      const attributes = await ProductAttribute.find({ isActive: true })
        .sort({ displayOrder: 1 });
      
      return {
        success: true,
        count: attributes.length,
        attributes
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async getFacetAttributes() {
    try {
      const attributes = await ProductAttribute.find({
        isActive: true,
        isFacet: true
      }).sort({ displayOrder: 1 });
      
      return {
        success: true,
        count: attributes.length,
        attributes
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async validateAttributeValue(attributeId, value) {
    try {
      const attribute = await ProductAttribute.findById(attributeId);
      
      if (!attribute) {
        return {
          success: false,
          error: 'Attribute not found'
        };
      }
      
      const isValid = attribute.validateValue(value);
      
      return {
        success: true,
        isValid,
        attribute: attribute.name
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ==== PRODUCT TAXONOMY ====
  
  static async createTaxonomy(data) {
    try {
      // Generate slug if not provided
      if (!data.slug) {
        data.slug = data.name
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^\w-]/g, '');
      }
      
      const taxonomy = await ProductTaxonomy.create(data);
      
      return {
        success: true,
        taxonomy
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async getTaxonomyHierarchy() {
    try {
      const hierarchy = await ProductTaxonomy.getFullHierarchy();
      
      return {
        success: true,
        hierarchy
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async getTaxonomyPath(taxonomyId) {
    try {
      const taxonomy = await ProductTaxonomy.findById(taxonomyId);
      
      if (!taxonomy) {
        return {
          success: false,
          error: 'Taxonomy not found'
        };
      }
      
      const breadcrumb = await taxonomy.getBreadcrumb();
      const path = await taxonomy.getPath();
      
      return {
        success: true,
        path,
        breadcrumb
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async updateTaxonomyMetadata(taxonomyId, metadata) {
    try {
      const taxonomy = await ProductTaxonomy.findByIdAndUpdate(
        taxonomyId,
        { metadata },
        { new: true }
      );
      
      if (!taxonomy) {
        return {
          success: false,
          error: 'Taxonomy not found'
        };
      }
      
      return {
        success: true,
        taxonomy
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ==== BULK IMPORT ====
  
  static async createBulkImportJob(data) {
    try {
      const job = await BulkImportJob.createJob(data);
      
      return {
        success: true,
        job
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async updateImportProgress(jobId, progressData) {
    try {
      const job = await BulkImportJob.findOne({ jobId });
      
      if (!job) {
        return {
          success: false,
          error: 'Import job not found'
        };
      }
      
      job.progress.totalRows = progressData.totalRows || job.progress.totalRows;
      job.progress.processedRows = progressData.processedRows || 0;
      job.progress.successRows = progressData.successRows || 0;
      job.progress.failedRows = progressData.failedRows || 0;
      
      job.updateProgress(
        job.progress.processedRows,
        job.progress.successRows,
        job.progress.failedRows
      );
      
      if (progressData.status) {
        job.status = progressData.status;
      }
      
      await job.save();
      
      return {
        success: true,
        job
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async addImportError(jobId, errorData) {
    try {
      const job = await BulkImportJob.findOne({ jobId });
      
      if (!job) {
        return {
          success: false,
          error: 'Import job not found'
        };
      }
      
      job.addError(
        errorData.rowNumber,
        errorData.field,
        errorData.value,
        errorData.errorMessage,
        errorData.severity || 'error'
      );
      
      if (job.validationRules.strictMode && errorData.severity === 'error') {
        job.status = 'failed';
      }
      
      await job.save();
      
      return {
        success: true,
        job
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async completeImportJob(jobId, resultsData) {
    try {
      const job = await BulkImportJob.findOne({ jobId });
      
      if (!job) {
        return {
          success: false,
          error: 'Import job not found'
        };
      }
      
      job.markAsCompleted(resultsData);
      await job.save();
      
      return {
        success: true,
        job
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async getImportJobStatus(jobId) {
    try {
      const job = await BulkImportJob.findOne({ jobId });
      
      if (!job) {
        return {
          success: false,
          error: 'Import job not found'
        };
      }
      
      return {
        success: true,
        status: job.status,
        progress: job.progress,
        errorCount: job.rowErrors.length,
        job
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async getImportJobsInProgress() {
    try {
      const jobs = await BulkImportJob.getJobsInProgress();
      
      return {
        success: true,
        count: jobs.length,
        jobs
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = CatalogService;
