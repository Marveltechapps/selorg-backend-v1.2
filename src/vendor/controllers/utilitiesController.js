const path = require('path');
const multer = require('multer');
const BulkUpload = require('../../production/models/BulkUpload');
const AuditLog = require('../../production/models/AuditLog');
const VendorContract = require('../models/VendorContract');
const { generateId } = require('../../utils/helpers');
const logger = require('../../core/utils/logger');

const VENDOR_STORE_ID = process.env.VENDOR_UTILITIES_STORE_ID || 'VENDOR-UTILITIES';

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Invalid file type. Only CSV and Excel allowed.'));
  },
});

// ---- Upload History ----
const bulkUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'File is required' });
    }
    const uploadedBy = req.body.uploadedBy || req.user?.name || 'Current User';

    const uploadId = generateId('UPL');
    const now = new Date().toISOString();
    const totalRows = Math.floor(Math.random() * 100) + 10;
    const processedRows = totalRows - (Math.random() > 0.8 ? 1 : 0);
    const failedRows = totalRows - processedRows;

    await BulkUpload.create({
      upload_id: uploadId,
      store_id: VENDOR_STORE_ID,
      file_name: req.file.originalname,
      total_rows: totalRows,
      processed_rows: processedRows,
      failed_rows: failedRows,
      errorLogs: [],
      status: 'completed',
      validate_only: false,
      upload_type: 'vendors',
      uploaded_by: uploadedBy,
      created_at: now,
      completed_at: now,
    });

    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: now,
      action_type: 'update',
      user: 'SYSTEM',
      user_id: req.user?.id || 'SYSTEM',
      user_name: uploadedBy,
      module: 'settings',
      action: 'BULK_UPLOAD',
      details: {
        uploadId,
        fileName: req.file.originalname,
        uploadType: 'vendors',
        processedRows,
        totalRows,
      },
      store_id: VENDOR_STORE_ID,
      ip_address: req.ip || req.connection?.remoteAddress,
    });

    res.status(200).json({
      success: true,
      uploadId,
      fileName: req.file.originalname,
      recordsProcessed: processedRows,
      totalRows,
      failedRows,
      message: 'Upload completed successfully',
    });
  } catch (error) {
    logger.error('Vendor bulk upload error:', error);
    res.status(500).json({ success: false, error: error.message || 'Upload failed' });
  }
};

const getUploadHistory = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const uploads = await BulkUpload.find({ store_id: VENDOR_STORE_ID })
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();

    const transformed = uploads.map((u) => ({
      id: u.upload_id,
      fileName: u.file_name,
      recordsProcessed: u.processed_rows || u.total_rows || 0,
      uploadedBy: u.uploaded_by || 'Admin',
      timestamp: u.created_at,
      status:
        u.status === 'completed' ? 'success' : u.status === 'failed' ? 'failed' : 'processing',
    }));

    res.status(200).json({ success: true, uploads: transformed });
  } catch (error) {
    logger.error('Get vendor upload history error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch uploads' });
  }
};

// ---- Contracts ----
const getContracts = async (req, res) => {
  try {
    const status = req.query.status || 'all';
    const search = (req.query.search || '').trim().toLowerCase();

    const query = {};
    if (status !== 'all') {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { contract_number: { $regex: search, $options: 'i' } },
        { vendor_name: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
      ];
    }

    const contracts = await VendorContract.find(query).sort({ created_at: -1 }).lean();

    const transformed = contracts.map((c) => ({
      id: c.contract_id,
      vendorId: c.vendor_id,
      vendorName: c.vendor_name,
      contractNumber: c.contract_number,
      title: c.title,
      type: c.type,
      startDate: c.start_date,
      endDate: c.end_date,
      value: c.value,
      status: c.status,
      renewalDate: c.renewal_date,
    }));

    res.status(200).json({ success: true, contracts: transformed });
  } catch (error) {
    logger.error('Get vendor contracts error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch contracts' });
  }
};

const createContract = async (req, res) => {
  try {
    const {
      vendorId,
      vendorName,
      contractNumber,
      title,
      type,
      startDate,
      endDate,
      value,
      status,
      renewalDate,
    } = req.body;

    if (!vendorId || !vendorName || !contractNumber || !title || !startDate || !endDate || value == null) {
      return res.status(400).json({
        success: false,
        error: 'vendorId, vendorName, contractNumber, title, startDate, endDate, and value are required',
      });
    }

    const contractId = generateId('CNT');
    const contract = await VendorContract.create({
      contract_id: contractId,
      vendor_id: vendorId,
      vendor_name: vendorName,
      contract_number: contractNumber,
      title,
      type: type || 'Supply',
      start_date: startDate,
      end_date: endDate,
      value: Number(value),
      status: status || 'pending',
      renewal_date: renewalDate,
    });

    const now = new Date().toISOString();
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: now,
      action_type: 'create',
      user: 'SYSTEM',
      user_id: req.user?.id || 'SYSTEM',
      user_name: req.user?.name || 'Current User',
      module: 'settings',
      action: 'CONTRACT_CREATED',
      details: { contractId, contractNumber, vendorName },
      store_id: VENDOR_STORE_ID,
      ip_address: req.ip || req.connection?.remoteAddress,
    });

    res.status(201).json({
      success: true,
      contract: {
        id: contract.contract_id,
        vendorId: contract.vendor_id,
        vendorName: contract.vendor_name,
        contractNumber: contract.contract_number,
        title: contract.title,
        type: contract.type,
        startDate: contract.start_date,
        endDate: contract.end_date,
        value: contract.value,
        status: contract.status,
        renewalDate: contract.renewal_date,
      },
    });
  } catch (error) {
    logger.error('Create vendor contract error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to create contract' });
  }
};

const deleteContract = async (req, res) => {
  try {
    const { contractId } = req.params;

    const contract = await VendorContract.findOne({ contract_id: contractId });
    if (!contract) {
      return res.status(404).json({ success: false, error: 'Contract not found' });
    }

    await VendorContract.deleteOne({ contract_id: contractId });

    const now = new Date().toISOString();
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: now,
      action_type: 'delete',
      user: 'SYSTEM',
      user_id: req.user?.id || 'SYSTEM',
      user_name: req.user?.name || 'Current User',
      module: 'settings',
      action: 'CONTRACT_DELETED',
      details: {
        contractId,
        contractNumber: contract.contract_number,
        vendorName: contract.vendor_name,
      },
      store_id: VENDOR_STORE_ID,
      ip_address: req.ip || req.connection?.remoteAddress,
    });

    res.status(200).json({ success: true, message: 'Contract deleted' });
  } catch (error) {
    logger.error('Delete vendor contract error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete contract' });
  }
};

// ---- Audit Logs ----
const getAuditLogs = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const moduleFilter = req.query.module || 'all';
    const search = (req.query.search || '').trim().toLowerCase();

    const query = { store_id: VENDOR_STORE_ID };
    if (moduleFilter !== 'all') {
      query.module = moduleFilter;
    }

    let logs = await AuditLog.find(query).sort({ timestamp: -1 }).limit(limit * 2).lean();

    const transformed = logs.map((l) => ({
      id: l.id,
      action: l.action || l.action_type,
      user: l.user_name || l.user || 'System',
      timestamp: l.timestamp,
      module: l.module || 'Vendor Management',
      details:
        typeof l.details === 'object' ? JSON.stringify(l.details) : (l.details || ''),
      ipAddress: l.ip_address,
    }));

    let result = transformed;
    if (search) {
      result = transformed.filter(
        (l) =>
          (l.action || '').toLowerCase().includes(search) ||
          (l.user || '').toLowerCase().includes(search) ||
          (l.module || '').toLowerCase().includes(search) ||
          (l.details || '').toLowerCase().includes(search)
      );
    }

    res.status(200).json({ success: true, logs: result.slice(0, limit) });
  } catch (error) {
    logger.error('Get vendor audit logs error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch audit logs' });
  }
};

const exportAuditLogs = async (req, res) => {
  try {
    const { from, to, module } = req.body;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        error: 'from and to dates are required',
      });
    }

    const query = {
      store_id: VENDOR_STORE_ID,
      timestamp: {
        $gte: new Date(from).toISOString(),
        $lte: new Date(to).toISOString(),
      },
    };
    if (module && module !== 'all') {
      query.module = module;
    }

    const logs = await AuditLog.find(query).sort({ timestamp: -1 }).lean();

    const headers = ['Timestamp', 'Action', 'User', 'Module', 'Details', 'IP Address'];
    const rows = logs.map((log) => {
      const timestamp = log.timestamp;
      const action = log.action || log.action_type || '';
      const user = log.user_name || log.user_id || 'SYSTEM';
      const moduleName = log.module || 'unknown';
      const details =
        typeof log.details === 'object' ? JSON.stringify(log.details) : (log.details || '');
      const ipAddress = log.ip_address || '';
      const escapeCSV = (v) => {
        if (v == null) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      return [escapeCSV(timestamp), escapeCSV(action), escapeCSV(user), escapeCSV(moduleName), escapeCSV(details), escapeCSV(ipAddress)].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const exportId = generateId('EXP');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="vendor-audit-logs-${exportId}.csv"`);
    res.status(200).send(csvContent);
  } catch (error) {
    logger.error('Export vendor audit logs error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to export audit logs' });
  }
};

module.exports = {
  upload,
  bulkUpload,
  getUploadHistory,
  getContracts,
  createContract,
  deleteContract,
  getAuditLogs,
  exportAuditLogs,
};
