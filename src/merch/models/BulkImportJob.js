const mongoose = require('mongoose');
const { Schema } = mongoose;

const BulkImportJobSchema = new Schema({
  jobId: { type: String, required: true, unique: true, index: true },
  fileName: { type: String, required: true, trim: true },
  fileUrl: { type: String }, // S3 or cloud storage URL
  fileSize: { type: Number }, // in bytes
  fileHash: { type: String }, // For deduplication
  importType: {
    type: String,
    enum: ['products', 'inventory', 'prices', 'taxonomy', 'attributes'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'validating', 'completed', 'failed', 'partially_failed'],
    default: 'pending',
    index: true
  },
  progress: {
    totalRows: { type: Number, default: 0 },
    processedRows: { type: Number, default: 0 },
    successRows: { type: Number, default: 0 },
    failedRows: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 }
  },
  errors: [{
    rowNumber: { type: Number },
    field: { type: String },
    value: Schema.Types.Mixed,
    errorMessage: { type: String },
    severity: { type: String, enum: ['error', 'warning'] } // error: blocks import, warning: logged but continues
  }],
  mappingConfig: {
    columnMapping: Schema.Types.Mixed, // Maps CSV columns to model fields
    delimiter: { type: String, default: ',' },
    hasHeader: { type: Boolean, default: true },
    encodingType: { type: String, default: 'utf-8' }
  },
  validationRules: {
    allowDuplicates: { type: Boolean, default: false },
    updateExisting: { type: Boolean, default: false },
    skipEmptyRows: { type: Boolean, default: true },
    strictMode: { type: Boolean, default: false } // If true, single error fails entire job
  },
  createdBy: { type: String, required: true, trim: true },
  startedAt: { type: Date },
  completedAt: { type: Date },
  estimatedTimeRemaining: { type: Number }, // in seconds
  retryCount: { type: Number, default: 0 },
  maxRetries: { type: Number, default: 3 },
  parentJobId: { type: String }, // For retry scenarios
  metadata: {
    source: { type: String }, // 'api', 'web_upload', 'automated'
    departmentId: { type: String },
    campaignId: { type: String },
    notes: { type: String }
  },
  results: {
    createdIds: [{ type: String }],
    updatedIds: [{ type: String }],
    failedIds: [{ type: String }],
    importDuration: { type: Number }, // in seconds
    catalogVersionCreated: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogVersion' }
  }
}, {
  timestamps: true,
  collection: 'bulk_import_jobs'
});

// Indexes
BulkImportJobSchema.index({ jobId: 1 });
BulkImportJobSchema.index({ status: 1, createdAt: -1 });
BulkImportJobSchema.index({ createdBy: 1, createdAt: -1 });
BulkImportJobSchema.index({ importType: 1 });
BulkImportJobSchema.index({ 'progress.percentage': 1 });

// Methods
BulkImportJobSchema.methods.updateProgress = function(processedRows, successRows, failedRows) {
  this.progress.processedRows = processedRows;
  this.progress.successRows = successRows;
  this.progress.failedRows = failedRows;
  this.progress.percentage = (processedRows / this.progress.totalRows) * 100;
  
  // Estimate time remaining
  if (processedRows > 0) {
    const elapsedSeconds = (Date.now() - this.startedAt.getTime()) / 1000;
    const rate = processedRows / elapsedSeconds; // rows per second
    const remaining = this.progress.totalRows - processedRows;
    this.estimatedTimeRemaining = remaining / rate;
  }
};

BulkImportJobSchema.methods.addError = function(rowNumber, field, value, errorMessage, severity = 'error') {
  this.errors.push({
    rowNumber,
    field,
    value,
    errorMessage,
    severity
  });
};

BulkImportJobSchema.methods.markAsCompleted = function(resultsData) {
  this.status = this.progress.failedRows > 0 ? 'partially_failed' : 'completed';
  this.completedAt = new Date();
  this.results = {
    ...this.results,
    ...resultsData,
    importDuration: (this.completedAt - this.startedAt) / 1000
  };
};

BulkImportJobSchema.methods.markAsFailed = function(errorMessage) {
  this.status = 'failed';
  this.completedAt = new Date();
  this.addError(null, 'job_level', null, errorMessage, 'error');
};

BulkImportJobSchema.methods.shouldStopProcessing = function() {
  if (this.validationRules.strictMode && this.progress.failedRows > 0) {
    return true;
  }
  return false;
};

BulkImportJobSchema.statics.createJob = async function(data) {
  const jobId = `JOB_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return this.create({
    jobId,
    ...data,
    startedAt: new Date()
  });
};

BulkImportJobSchema.statics.getJobsByStatus = function(status) {
  return this.find({ status }).sort({ createdAt: -1 });
};

BulkImportJobSchema.statics.getJobsInProgress = function() {
  return this.find({ 
    status: { $in: ['pending', 'processing', 'validating'] }
  }).sort({ createdAt: -1 });
};

module.exports = mongoose.models.BulkImportJob || mongoose.model('BulkImportJob', BulkImportJobSchema);
