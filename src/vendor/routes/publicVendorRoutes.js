const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Vendor = require('../models/Vendor');
const inviteService = require('../services/inviteService');

// Multer setup for document uploads
const docStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(
      __dirname,
      '../../../../uploads/vendor-docs',
      req.params.vendorId || 'temp'
    );
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${Date.now()}${ext}`);
  },
});

const uploadDocs = multer({
  storage: docStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPG, PNG allowed'));
    }
  },
});

// ROUTE 1: Verify invite token
// GET /api/v1/vendor/public/verify-token?token=xxx
router.get('/verify-token', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({
        error: 'Token is required',
      });
    }
    const vendorData = await inviteService.validateInviteToken(token);
    res.json({
      success: true,
      vendor: vendorData,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
  }
});

// ROUTE 2: Complete vendor profile (vendor fills their form)
// POST /api/v1/vendor/public/complete-profile
router.post('/complete-profile', async (req, res) => {
  try {
    const { token, vendorData } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    // Validate token
    const tokenData = await inviteService.validateInviteToken(token);
    const vendorId = tokenData.vendorId;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    // Update all fields
    if (vendorData.name) vendor.name = vendorData.name;
    vendor.contact = {
      name: vendorData.contactName || vendorData.name,
      email: vendorData.email || vendor.contact?.email,
      phone: vendorData.phone || '',
    };
    vendor.address = {
      line1: vendorData.addressLine1 || '',
      line2: vendorData.addressLine2 || '',
      city: vendorData.city || '',
      state: vendorData.state || '',
      pincode: vendorData.postalCode || '',
    };

    if (!vendor.metadata) vendor.metadata = {};
    Object.assign(vendor.metadata, {
      vendorType: vendorData.vendorType || vendor.metadata.vendorType,
      category: vendorData.category || vendor.metadata.category,
      gstNumber: vendorData.gstNumber || '',
      panNumber: vendorData.panNumber || '',
      bankName: vendorData.bankName || '',
      accountType: vendorData.accountType || 'Current',
      bankAccount: vendorData.bankAccount || '',
      ifscCode: vendorData.ifscCode || '',
      accountHolder: vendorData.accountHolder || '',
      selectedCategories: vendorData.selectedCategories || [],
      productType: vendorData.productType || '',
      registrationNumber: vendorData.registrationNumber || '',
      description: vendorData.description || '',
      profileCompletedAt: new Date().toISOString(),
      inviteStatus: 'completed',
      // Keep inviteToken so subsequent validation can return "already used".
      inviteToken: token,
    });

    vendor.status = 'pending';
    vendor.stage = 'new_request';
    vendor.markModified('metadata');
    await vendor.save();

    res.json({
      success: true,
      message:
        'Profile submitted successfully! We will review and contact you within 2-3 business days.',
      vendorId: vendor._id.toString(),
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ROUTE 3: Upload documents (vendor uploads their own docs)
// POST /api/v1/vendor/public/upload-documents/:vendorId
router.post(
  '/upload-documents/:vendorId',
  uploadDocs.array('documents', 6),
  async (req, res) => {
    try {
      const { vendorId } = req.params;
      const { token, documentType } = req.body;

      // Verify the token matches this vendor
      if (token) {
        const tokenData = await inviteService.validateInviteToken(token).catch(() => null);
        if (tokenData && tokenData.vendorId !== vendorId) {
          return res.status(403).json({
            error: 'Token mismatch',
          });
        }
      }

      const vendor = await Vendor.findById(vendorId);
      if (!vendor) {
        return res.status(404).json({ error: 'Vendor not found' });
      }

      const uploadedFiles = (req.files || []).map((file) => ({
        name: file.originalname,
        type: documentType || 'other',
        path: file.path,
        filename: file.filename,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        status: 'pending',
      }));

      if (!vendor.metadata) vendor.metadata = {};
      if (!vendor.metadata.documents) vendor.metadata.documents = [];
      vendor.metadata.documents.push(...uploadedFiles);
      vendor.markModified('metadata');
      await vendor.save();

      res.json({
        success: true,
        uploaded: uploadedFiles.length,
        files: uploadedFiles.map((f) => ({
          name: f.name,
          type: f.type,
          status: f.status,
        })),
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

module.exports = router;

