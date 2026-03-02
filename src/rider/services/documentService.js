const Document = require('../models/Document');
const RiderHR = require('../models/RiderHR');
const logger = require('../../core/utils/logger');

const listDocuments = async (filters = {}, pagination = {}) => {
  try {
    const { status, riderId, documentType, page = 1, limit = 50 } = { ...filters, ...pagination };

    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (riderId) {
      query.riderId = riderId;
    }

    if (documentType) {
      query.documentType = documentType;
    }

    const skip = (page - 1) * limit;
    const total = await Document.countDocuments(query);

    const documents = await Document.find(query)
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return {
      data: documents,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    };
  } catch (error) {
    logger.error('Error listing documents:', error);
    throw error;
  }
};

const getDocumentDetails = async (documentId) => {
  try {
    const document = await Document.findOne({ id: documentId }).lean();

    if (!document) {
      const error = new Error('Document not found');
      error.statusCode = 404;
      throw error;
    }

    return document;
  } catch (error) {
    logger.error('Error getting document details:', error);
    throw error;
  }
};

const reviewDocument = async (documentId, reviewData) => {
  try {
    const { action, notes, rejectionReason } = reviewData;

    const document = await Document.findOne({ id: documentId });

    if (!document) {
      const error = new Error('Document not found');
      error.statusCode = 404;
      throw error;
    }

    // Validate action
    if (!['approve', 'reject', 'request_resubmission'].includes(action)) {
      const error = new Error('Invalid action');
      error.statusCode = 400;
      throw error;
    }

    // Validate rejection reason for reject/request_resubmission
    if ((action === 'reject' || action === 'request_resubmission') && !rejectionReason) {
      const error = new Error('Rejection reason is required for reject/request_resubmission');
      error.statusCode = 400;
      throw error;
    }

    // Update document status
    if (action === 'approve') {
      document.status = 'approved';
      document.reviewer = reviewData.reviewer || 'System';
      document.reviewedAt = new Date();
      document.rejectionReason = null;
    } else if (action === 'reject') {
      document.status = 'rejected';
      document.reviewer = reviewData.reviewer || 'System';
      document.reviewedAt = new Date();
      document.rejectionReason = rejectionReason;
    } else if (action === 'request_resubmission') {
      document.status = 'resubmitted';
      document.reviewer = reviewData.reviewer || 'System';
      document.reviewedAt = new Date();
      document.rejectionReason = rejectionReason;
      document.submittedAt = new Date(); // Update submission time
    }

    // Add to approval history
    document.approvalHistory.push({
      id: `hist-${Date.now()}`,
      riderId: document.riderId,
      riderName: document.riderName,
      documentType: document.documentType,
      action: action === 'approve' ? 'approved' : 'rejected',
      actionBy: reviewData.reviewer || 'System',
      actionAt: new Date(),
      notes: notes || null,
    });

    await document.save();

    // Update rider onboarding status based on document approval
    if (action === 'approve') {
      // Check if all required documents are approved for this rider
      const allDocuments = await Document.find({ riderId: document.riderId }).lean();
      const requiredDocTypes = ['ID Proof', 'Driving License', 'Vehicle RC', 'Insurance Policy'];
      const hasAllRequired = requiredDocTypes.every(docType => {
        const doc = allDocuments.find(d => d.documentType === docType);
        return doc && doc.status === 'approved';
      });

      if (hasAllRequired) {
        // Update rider onboarding status to approved if all required docs are approved
        await RiderHR.updateOne(
          { id: document.riderId },
          { onboardingStatus: 'approved' }
        );
      } else {
        // Update to under_review if some docs are approved
        const rider = await RiderHR.findOne({ id: document.riderId });
        if (rider && rider.onboardingStatus === 'invited') {
          await RiderHR.updateOne(
            { id: document.riderId },
            { onboardingStatus: 'under_review' }
          );
        }
      }
    } else if (action === 'reject' || action === 'request_resubmission') {
      // Update rider onboarding status to docs_pending if document is rejected
      await RiderHR.updateOne(
        { id: document.riderId },
        { onboardingStatus: 'docs_pending' }
      );
    }

    return document.toObject();
  } catch (error) {
    logger.error('Error reviewing document:', error);
    throw error;
  }
};

const getDocumentRejectionReason = async (documentId) => {
  try {
    const document = await Document.findOne({ id: documentId }).select('rejectionReason').lean();

    if (!document) {
      const error = new Error('Document not found');
      error.statusCode = 404;
      throw error;
    }

    return {
      rejectionReason: document.rejectionReason || null,
    };
  } catch (error) {
    logger.error('Error getting rejection reason:', error);
    throw error;
  }
};

const getDocumentHistory = async (documentId) => {
  try {
    const document = await Document.findOne({ id: documentId }).select('approvalHistory').lean();

    if (!document) {
      const error = new Error('Document not found');
      error.statusCode = 404;
      throw error;
    }

    return {
      documentId,
      history: document.approvalHistory || [],
    };
  } catch (error) {
    logger.error('Error getting document history:', error);
    throw error;
  }
};

module.exports = {
  listDocuments,
  getDocumentDetails,
  reviewDocument,
  getDocumentRejectionReason,
  getDocumentHistory,
};

