const ExcelJS = require('exceljs');
const { Readable } = require('stream');
const vendorService = require('./vendorService');

/** Canonical CSV/Excel headers (row 1). Aliases are matched case-insensitively. */
const TEMPLATE_HEADERS = [
  'vendorCode',
  'vendorName',
  'status',
  'gstin',
  'pan',
  'paymentTerms',
  'currencyCode',
  'contactName',
  'contactPhone',
  'contactEmail',
  'addressLine1',
  'addressLine2',
  'addressCity',
  'addressState',
  'addressCountry',
  'zipCode',
  'creditLimit',
  'leadTimeDays',
  'minimumOrderValue',
];

const HEADER_ALIASES = {
  vendorcode: 'vendorCode',
  code: 'vendorCode',
  vendorname: 'vendorName',
  name: 'vendorName',
  status: 'status',
  gstin: 'gstin',
  gst: 'gstin',
  taxinfo_gstin: 'gstin',
  pan: 'pan',
  taxinfo_pan: 'pan',
  paymentterms: 'paymentTerms',
  payment_terms: 'paymentTerms',
  currencycode: 'currencyCode',
  currency: 'currencyCode',
  contactname: 'contactName',
  contact_name: 'contactName',
  contactphone: 'contactPhone',
  phone: 'contactPhone',
  contact_phone: 'contactPhone',
  contactemail: 'contactEmail',
  email: 'contactEmail',
  contact_email: 'contactEmail',
  addressline1: 'addressLine1',
  address_line1: 'addressLine1',
  line1: 'addressLine1',
  address: 'addressLine1',
  addressline2: 'addressLine2',
  address_line2: 'addressLine2',
  line2: 'addressLine2',
  addresscity: 'addressCity',
  city: 'addressCity',
  addressstate: 'addressState',
  state: 'addressState',
  addresscountry: 'addressCountry',
  country: 'addressCountry',
  zipcode: 'zipCode',
  zip: 'zipCode',
  pincode: 'zipCode',
  postalcode: 'zipCode',
  creditlimit: 'creditLimit',
  leadtimedays: 'leadTimeDays',
  minimumordervalue: 'minimumOrderValue',
  mov: 'minimumOrderValue',
};

function normalizeHeader(cell) {
  const raw = String(cell ?? '').trim();
  if (!raw) return '';
  const key = raw.replace(/\s+/g, '').toLowerCase();
  return HEADER_ALIASES[key] || raw;
}

function cellValue(val) {
  if (val == null) return '';
  if (typeof val === 'object' && val.text != null) return String(val.text).trim();
  if (typeof val === 'object' && val.result != null) return String(val.result).trim();
  return String(val).trim();
}

async function loadWorksheetRows(buffer, ext) {
  const workbook = new ExcelJS.Workbook();
  if (ext === '.csv') {
    await workbook.csv.read(Readable.from(buffer));
  } else {
    await workbook.xlsx.load(buffer);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const matrix = [];
  sheet.eachRow((row) => {
    const cells = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cells[colNumber - 1] = cellValue(cell.value);
    });
    matrix.push(cells);
  });

  if (!matrix.length) return { headers: [], rows: [] };

  const headerRow = matrix[0].map(normalizeHeader);
  const rows = [];
  for (let i = 1; i < matrix.length; i++) {
    const line = matrix[i];
    if (!line || line.every((c) => !String(c ?? '').trim())) continue;
    const obj = {};
    headerRow.forEach((h, idx) => {
      if (!h) return;
      obj[h] = String(line[idx] ?? '').trim();
    });
    rows.push(obj);
  }
  return { headers: headerRow, rows };
}

function mapRowToVendorPayload(row) {
  const creditLimit = row.creditLimit ? Number(row.creditLimit) : undefined;
  const leadTimeDays = row.leadTimeDays ? Number(row.leadTimeDays) : undefined;
  const minimumOrderValue = row.minimumOrderValue ? Number(row.minimumOrderValue) : undefined;

  const metadata = {};
  if (creditLimit != null && !Number.isNaN(creditLimit)) metadata.creditLimit = creditLimit;
  if (leadTimeDays != null && !Number.isNaN(leadTimeDays)) metadata.leadTimeDays = leadTimeDays;
  if (minimumOrderValue != null && !Number.isNaN(minimumOrderValue)) {
    metadata.minimumOrderValue = minimumOrderValue;
  }
  if (row.gstin) metadata.gstNumber = row.gstin;
  if (row.pan) metadata.panNumber = row.pan;

  return {
    vendorCode: row.vendorCode,
    vendorName: row.vendorName,
    status: row.status || 'pending',
    paymentTerms: row.paymentTerms || 'net30',
    currencyCode: row.currencyCode || 'INR',
    taxInfo: {
      gstin: row.gstin,
      pan: row.pan || '',
    },
    contact: {
      name: row.contactName,
      phone: row.contactPhone,
      email: row.contactEmail,
    },
    address: {
      line1: row.addressLine1,
      line2: row.addressLine2 || null,
      city: row.addressCity,
      state: row.addressState,
      country: row.addressCountry || 'India',
      zipCode: row.zipCode,
      pincode: row.zipCode,
    },
    metadata: Object.keys(metadata).length ? metadata : undefined,
  };
}

function buildTemplateCsv() {
  const header = TEMPLATE_HEADERS.join(',');
  const sample = [
    'VND-001',
    'Sample Vendor Pvt Ltd',
    'pending',
    '29ABCDE1234F1Z5',
    'ABCDE1234F',
    'net30',
    'INR',
    'Ravi Kumar',
    '9876543210',
    'ravi@samplevendor.com',
    '12 Industrial Estate',
    '',
    'Chennai',
    'Tamil Nadu',
    'India',
    '600001',
    '500000',
    '2',
    '1000',
  ].join(',');
  return `${header}\n${sample}\n`;
}

async function processBulkVendorUpload({ buffer, ext, uploadedBy }) {
  const { rows } = await loadWorksheetRows(buffer, ext);
  const totalRows = rows.length;
  const errorLogs = [];
  let processedRows = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const payload = mapRowToVendorPayload(rows[i]);
    if (!payload.vendorCode && !payload.vendorName) {
      errorLogs.push({ row: rowNum, error: 'vendorCode and vendorName are required' });
      continue;
    }
    try {
      await vendorService.createVendor(payload);
      processedRows += 1;
    } catch (err) {
      errorLogs.push({
        row: rowNum,
        vendorCode: payload.vendorCode,
        error: err.message || 'Failed to create vendor',
      });
    }
  }

  const failedRows = errorLogs.length;
  const status = failedRows === totalRows && totalRows > 0 ? 'failed' : 'completed';

  return {
    totalRows,
    processedRows,
    failedRows,
    errorLogs,
    status,
    uploadedBy,
  };
}

module.exports = {
  TEMPLATE_HEADERS,
  buildTemplateCsv,
  processBulkVendorUpload,
};
