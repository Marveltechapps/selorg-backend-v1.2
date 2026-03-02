const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const logger = require('../core/utils/logger');

/**
 * Export Utilities
 * Handles PDF and Excel exports
 */

/**
 * Export data to PDF
 * @param {Array} data - Data to export
 * @param {Object} options - Export options
 */
async function exportToPDF(data, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const filename = options.filename || `export_${Date.now()}.pdf`;
      const filepath = path.join(__dirname, '../../temp', filename);

      // Ensure temp directory exists
      const tempDir = path.dirname(filepath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // Add title
      if (options.title) {
        doc.fontSize(20).text(options.title, { align: 'center' });
        doc.moveDown();
      }

      // Add table
      if (data && data.length > 0) {
        const headers = Object.keys(data[0]);
        const columnWidth = 500 / headers.length;

        // Table header
        doc.fontSize(12).font('Helvetica-Bold');
        headers.forEach((header, i) => {
          doc.text(header, 50 + i * columnWidth, doc.y, {
            width: columnWidth,
            align: 'left',
          });
        });
        doc.moveDown();

        // Table rows
        doc.fontSize(10).font('Helvetica');
        data.forEach((row, rowIndex) => {
          if (doc.y > 700) {
            doc.addPage();
          }

          headers.forEach((header, colIndex) => {
            const value = row[header] || '';
            doc.text(String(value), 50 + colIndex * columnWidth, doc.y, {
              width: columnWidth,
              align: 'left',
            });
          });
          doc.moveDown(0.5);
        });
      }

      doc.end();

      stream.on('finish', () => {
        resolve({
          filepath,
          filename,
          size: fs.statSync(filepath).size,
        });
      });

      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Export data to Excel
 * @param {Array} data - Data to export
 * @param {Object} options - Export options
 */
async function exportToExcel(data, options = {}) {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(options.sheetName || 'Sheet1');

    // Add title row
    if (options.title) {
      worksheet.mergeCells('A1:' + String.fromCharCode(64 + Object.keys(data[0] || {}).length) + '1');
      const titleRow = worksheet.getRow(1);
      titleRow.getCell(1).value = options.title;
      titleRow.getCell(1).font = { size: 16, bold: true };
      titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      titleRow.height = 30;
      worksheet.addRow([]);
    }

    // Add headers
    if (data && data.length > 0) {
      const headers = Object.keys(data[0]);
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };

      // Add data rows
      data.forEach((row) => {
        const values = headers.map((header) => row[header] || '');
        worksheet.addRow(values);
      });

      // Auto-fit columns
      worksheet.columns.forEach((column) => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
          const columnLength = cell.value ? cell.value.toString().length : 10;
          if (columnLength > maxLength) {
            maxLength = columnLength;
          }
        });
        column.width = maxLength < 10 ? 10 : maxLength + 2;
      });
    }

    const filename = options.filename || `export_${Date.now()}.xlsx`;
    const filepath = path.join(__dirname, '../../temp', filename);

    // Ensure temp directory exists
    const tempDir = path.dirname(filepath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    await workbook.xlsx.writeFile(filepath);

    return {
      filepath,
      filename,
      size: fs.statSync(filepath).size,
    };
  } catch (error) {
    logger.error('Error exporting to Excel:', error);
    throw error;
  }
}

/**
 * Export data to CSV
 * @param {Array} data - Data to export
 * @param {Object} options - Export options
 */
function exportToCSV(data, options = {}) {
  if (!data || data.length === 0) {
    return '';
  }

  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) {
        return '';
      }
      const stringValue = String(value);
      // Escape quotes and wrap in quotes if contains comma, newline, or quote
      if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    })
  );

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

module.exports = {
  exportToPDF,
  exportToExcel,
  exportToCSV,
};
