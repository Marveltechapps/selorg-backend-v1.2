const LabelPrintJob = require('../models/LabelPrintJob');
const BulkUpload = require('../models/BulkUpload');
const AuditLog = require('../models/AuditLog');
const { generateId } = require('../../utils/helpers');
const multer = require('multer');
const path = require('path');
const logger = require('../../core/utils/logger');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
    }
  }
});

/**
 * Generate Label
 * POST /api/darkstore/utilities/labels/generate
 */
const generateLabel = async (req, res) => {
  try {
    const { searchTerm, labelType, quantity, printerId } = req.body;
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';

    if (!searchTerm || !labelType || !quantity) {
      return res.status(400).json({
        success: false,
        error: 'searchTerm, labelType, and quantity are required',
      });
    }

    const labelId = generateId('LBL');
    const printJobId = generateId('JOB');
    const now = new Date().toISOString();

    await LabelPrintJob.create({
      label_id: labelId,
      print_job_id: printJobId,
      search_term: searchTerm,
      label_type: labelType,
      quantity: quantity,
      printer_id: printerId,
      status: 'queued',
      store_id: storeId,
      created_at: now,
    });

    // Create audit log entry
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: now,
      action_type: 'update',
      user: 'SYSTEM',
      user_id: req.user?.id || 'SYSTEM',
      user_name: req.user?.name || 'System',
      module: 'settings',
      action: 'GENERATE_LABEL',
      details: {
        labelId,
        printJobId,
        searchTerm,
        labelType,
        quantity,
        printerId,
      },
      store_id: storeId,
      ip_address: req.ip || req.connection.remoteAddress,
    });

    res.status(200).json({
      success: true,
      labelId: labelId,
      printJobId: printJobId,
      status: 'queued',
      message: 'Label generated and queued for printing',
    });
  } catch (error) {
    logger.error('Generate label error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate label',
    });
  }
};

/**
 * Bulk SKU Upload
 * POST /api/darkstore/utilities/inventory/bulk-upload
 */
const bulkUpload = async (req, res) => {
  try {
    const uploadMiddleware = upload.single('file');
    
    uploadMiddleware(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          error: err.message || 'File upload failed',
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'File is required',
        });
      }

      const storeId = req.body.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
      const validateOnly = req.body.validateOnly === 'true' || req.body.validateOnly === true;

      const uploadId = generateId('UPL');
      const now = new Date().toISOString();

      // In production, parse CSV/Excel file here
      // For now, mock processing
      const totalRows = 500;
      const processedRows = 498;
      const failedRows = 2;
      const errors = [
        { row: 45, error: 'Invalid SKU format' },
        { row: 120, error: 'Missing required field: quantity' },
      ];

      await BulkUpload.create({
        upload_id: uploadId,
        store_id: storeId,
        file_name: req.file.originalname,
        total_rows: totalRows,
        processed_rows: processedRows,
        failed_rows: failedRows,
        errorLogs: errors,
        status: 'completed',
        validate_only: validateOnly,
        created_at: now,
        completed_at: now,
      });

      // Create audit log entry
      await AuditLog.create({
        id: generateId('AUD'),
        timestamp: now,
        action_type: 'update',
        user: 'SYSTEM',
        user_id: req.user?.id || 'SYSTEM',
        user_name: req.user?.name || 'System',
        module: 'settings',
        action: 'BULK_UPLOAD',
        details: {
          uploadId,
          fileName: req.file.originalname,
          totalRows,
          processedRows,
          failedRows,
          errors,
          validateOnly,
        },
        store_id: storeId,
        ip_address: req.ip || req.connection.remoteAddress,
      });

      res.status(200).json({
        success: true,
        uploadId: uploadId,
        totalRows: totalRows,
        processedRows: processedRows,
        failedRows: failedRows,
        errors: errors,
        message: 'Bulk upload completed with 2 errors',
      });
    });
  } catch (error) {
    logger.error('Bulk upload error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process bulk upload',
    });
  }
};

/**
 * Download Upload Template
 * GET /api/darkstore/utilities/inventory/upload-template
 */
const downloadUploadTemplate = async (req, res) => {
  try {
    const format = req.query.format || 'csv';

    // In production, generate actual template file
    // For now, return mock CSV content
    const csvContent = 'SKU,Product Name,Quantity,Location\nSKU-001,Sample Product,10,A-12-03\n';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="bulk-upload-template.${format}"`);
    res.send(csvContent);
  } catch (error) {
    logger.error('Download template error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to download template',
    });
  }
};

/**
 * Get System Status
 * GET /api/darkstore/utilities/system/status
 */
const getSystemStatus = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';

    // Mock system status - in production, check actual services
    const services = [
      {
        name: 'Inventory Sync',
        status: 'operational',
        latency: 45,
        lastCheck: new Date().toISOString(),
      },
      {
        name: 'Order Service',
        status: 'degraded',
        latency: 850,
        lastCheck: new Date().toISOString(),
        message: 'High latency detected',
      },
      {
        name: 'User Auth',
        status: 'operational',
        latency: 22,
        lastCheck: new Date().toISOString(),
      },
    ];

    const overallStatus = services.some(s => s.status === 'down') 
      ? 'down' 
      : services.some(s => s.status === 'degraded') 
        ? 'degraded' 
        : 'operational';

    res.status(200).json({
      success: true,
      services: services,
      overallStatus: overallStatus,
    });
  } catch (error) {
    logger.error('Get system status error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch system status',
    });
  }
};

/**
 * Run System Diagnostics
 * POST /api/darkstore/utilities/system/diagnostics
 */
const runSystemDiagnostics = async (req, res) => {
  try {
    const { diagnosticType, storeId } = req.body;

    if (!diagnosticType) {
      return res.status(400).json({
        success: false,
        error: 'diagnosticType is required',
      });
    }

    const diagnosticId = generateId('DIAG');
    const now = new Date();
    const estimatedCompletion = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes

    // In production, start actual diagnostic process

    // Create audit log entry
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: now.toISOString(),
      action_type: 'data_push',
      user: 'SYSTEM',
      user_id: req.user?.id || 'SYSTEM',
      user_name: req.user?.name || 'System',
      module: 'sync',
      action: 'RUN_DIAGNOSTICS',
      details: {
        diagnosticId,
        diagnosticType,
        status: 'running',
        estimatedCompletion: estimatedCompletion.toISOString(),
      },
      store_id: storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04',
      ip_address: req.ip || req.connection.remoteAddress,
    });

    res.status(200).json({
      success: true,
      diagnosticId: diagnosticId,
      status: 'running',
      estimatedCompletion: estimatedCompletion.toISOString(),
      message: 'Database re-index started',
    });
  } catch (error) {
    logger.error('Run system diagnostics error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to run diagnostics',
    });
  }
};

/**
 * Force Global Sync
 * POST /api/darkstore/utilities/system/sync
 */
const forceGlobalSync = async (req, res) => {
  try {
    const { storeId, syncType } = req.body;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId is required',
      });
    }

    const syncId = generateId('SYNC');
    const now = new Date().toISOString();

    // In production, perform actual sync
    const recordsPushed = 450;

    // Create audit log entry
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: now,
      action_type: 'data_push',
      user: 'SYSTEM',
      user_id: req.user?.id || 'SYSTEM',
      user_name: req.user?.name || 'System',
      module: 'sync',
      action: 'FORCE_GLOBAL_SYNC',
      details: {
        syncId,
        syncType: syncType || 'full',
        recordsPushed,
        status: 'completed',
      },
      store_id: storeId,
      ip_address: req.ip || req.connection.remoteAddress,
    });

    res.status(200).json({
      success: true,
      syncId: syncId,
      recordsPushed: recordsPushed,
      status: 'completed',
      completedAt: now,
      message: 'Global sync completed successfully',
    });
  } catch (error) {
    logger.error('Force global sync error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to sync',
    });
  }
};

/**
 * Get Audit Logs
 * GET /api/darkstore/utilities/audit-logs
 */
const getAuditLogs = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const module = req.query.module || 'all';
    const userId = req.query.userId;
    const action = req.query.action;
    const from = req.query.from;
    const to = req.query.to;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const query = { store_id: storeId };
    if (module !== 'all') {
      query.module = module;
    }
    if (userId) {
      query.user_id = userId;
    }
    if (action) {
      query.action = action;
    }
    if (from || to) {
      query.timestamp = {};
      if (from) {
        query.timestamp.$gte = from;
      }
      if (to) {
        query.timestamp.$lte = to;
      }
    }

    const totalItems = await AuditLog.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const transformedLogs = logs.map(log => ({
      timestamp: log.timestamp,
      userId: log.user_id || log.user || 'SYSTEM',
      userName: log.user_name || log.user || 'Admin (System)',
      module: log.module || 'inventory',
      action: log.action || log.action_type,
      details: typeof log.details === 'string' ? log.details : JSON.stringify(log.details),
      ipAddress: log.ip_address,
    }));

    res.status(200).json({
      success: true,
      logs: transformedLogs,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_items: totalItems,
        items_per_page: limit,
      },
    });
  } catch (error) {
    logger.error('Get audit logs error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch audit logs',
    });
  }
};

/**
 * Export Audit Logs
 * POST /api/darkstore/utilities/audit-logs/export
 */
const exportAuditLogs = async (req, res) => {
  try {
    const { module, from, to, format } = req.body;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        error: 'from and to dates are required',
      });
    }

    const storeId = req.body.storeId || req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    
    // Build query
    const query = {
      store_id: storeId,
      timestamp: {
        $gte: new Date(from),
        $lte: new Date(to),
      },
    };

    if (module && module !== 'all') {
      query.module = module;
    }

    // Fetch audit logs
    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .lean();

    const exportId = generateId('EXP');
    const exportFormat = format || 'csv';

    // Generate CSV content
    if (exportFormat === 'csv') {
      // CSV Headers
      const headers = ['Timestamp', 'User', 'Module', 'Action', 'Details', 'IP Address'];
      
      // CSV Rows
      const rows = logs.map(log => {
        const timestamp = new Date(log.timestamp).toLocaleString();
        const user = log.user_name || log.user_id || 'SYSTEM';
        const moduleName = log.module || 'unknown';
        const action = log.action || log.action_type || 'unknown';
        const details = typeof log.details === 'object' ? JSON.stringify(log.details) : (log.details || '');
        const ipAddress = log.ip_address || '';
        
        // Escape CSV values (handle commas, quotes, newlines)
        const escapeCSV = (value) => {
          if (value === null || value === undefined) return '';
          const str = String(value);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };
        
        return [
          escapeCSV(timestamp),
          escapeCSV(user),
          escapeCSV(moduleName),
          escapeCSV(action),
          escapeCSV(details),
          escapeCSV(ipAddress),
        ].join(',');
      });

      // Combine headers and rows
      const csvContent = [headers.join(','), ...rows].join('\n');

      // Create audit log entry for the export action
      await AuditLog.create({
        id: generateId('AUD'),
        timestamp: new Date().toISOString(),
        action_type: 'update',
        user: 'SYSTEM',
        user_id: req.user?.id || 'SYSTEM',
        user_name: req.user?.name || 'System',
        module: 'settings',
        action: 'EXPORT_AUDIT_LOGS',
        details: {
          exportId,
          module: module || 'all',
          format: exportFormat,
          from,
          to,
          recordCount: logs.length,
        },
        store_id: storeId,
        ip_address: req.ip || req.connection.remoteAddress,
      });

      // Set headers for CSV download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${exportId}.csv"`);
      res.status(200).send(csvContent);
    } else {
      // For Excel format, return JSON (can be enhanced with xlsx library later)
      const exportUrl = `https://storage.example.com/exports/audit-logs-${exportId}.xlsx`;
      
      await AuditLog.create({
        id: generateId('AUD'),
        timestamp: new Date().toISOString(),
        action_type: 'update',
        user: 'SYSTEM',
        user_id: req.user?.id || 'SYSTEM',
        user_name: req.user?.name || 'System',
        module: 'settings',
        action: 'EXPORT_AUDIT_LOGS',
        details: {
          exportId,
          module: module || 'all',
          format: exportFormat,
          from,
          to,
          exportUrl,
        },
        store_id: storeId,
        ip_address: req.ip || req.connection.remoteAddress,
      });

      res.status(200).json({
        success: true,
        exportUrl: exportUrl,
        exportId: exportId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        message: 'Audit logs exported successfully',
      });
    }
  } catch (error) {
    logger.error('Export audit logs error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export audit logs',
    });
  }
};

module.exports = {
  generateLabel,
  bulkUpload,
  downloadUploadTemplate,
  getSystemStatus,
  runSystemDiagnostics,
  forceGlobalSync,
  getAuditLogs,
  exportAuditLogs,
};

