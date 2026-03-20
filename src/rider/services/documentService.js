const Document = require('../models/Document');
const RiderHR = require('../models/RiderHR');
const { Rider: RiderV2 } = require('../../rider_v2_backend/src/models/Rider');
const logger = require('../../core/utils/logger');

const DOC_TYPE_MAPPING = {
  'aadhar': 'ID Proof',
  'pan': 'ID Proof',
  'drivingLicense': 'Driving License',
  'vehicleRC': 'Vehicle RC',
  'vehicleInsurance': 'Insurance Policy'
};

const listDocuments = async (filters = {}, pagination = {}) => {
  try {
    const { status, riderId, documentType, page = 1, limit = 50 } = { ...filters, ...pagination };

    const query = { id: { $exists: true, $regex: /^DOC-\d+$/ } };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (riderId) {
      query.riderId = riderId;
    }

    if (documentType) {
      query.documentType = documentType;
    }

    // Fetch documents from the main Document collection
    const documents = await Document.find(query)
      .sort({ submittedAt: -1 })
      .lean();

    // Fetch documents from RiderV2 collection if no specific riderId or if it matches RiderV2 format
    let v2Documents = [];
    if (!riderId || riderId.startsWith('RDR-')) {
      const v2Query = {};
      if (riderId) v2Query.riderId = riderId;
      
      const ridersV2 = await RiderV2.find(v2Query).lean();
      ridersV2.forEach(rider => {
        if (rider.documents) {
          Object.keys(rider.documents).forEach(docType => {
            const doc = rider.documents[docType];
            if (doc && doc.documentUrl) {
              const normalizedStatus = doc.status === 'verified' ? 'approved' : 
                                     doc.status === 'failed' ? 'rejected' : 'pending';
              
              // Apply status filter if present
              if (status && status !== 'all' && normalizedStatus !== status) {
                return;
              }

              const normalizedDocType = DOC_TYPE_MAPPING[docType] || docType;
              // Apply documentType filter if present
              if (documentType && normalizedDocType !== documentType) {
                return;
              }

              v2Documents.push({
                id: `RDR_V2_${rider.riderId}_${docType}`,
                riderId: rider.riderId,
                riderName: rider.name,
                documentType: normalizedDocType,
                submittedAt: doc.uploadedAt || rider.updatedAt || rider.createdAt,
                status: normalizedStatus,
                rejectionReason: doc.rejectionReason || null,
                fileUrl: doc.documentUrl,
                isV2: true
              });
            }
          });
        }
      });
    }

    // Combine and sort
    let allDocuments = [...documents, ...v2Documents];
    allDocuments.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    const total = allDocuments.length;
    const skip = (page - 1) * limit;
    const paginatedDocuments = allDocuments.slice(skip, skip + limit);

    return {
      data: paginatedDocuments,
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
    if (documentId.startsWith('RDR_V2_')) {
      const [,, riderId, docType] = documentId.split('_');
      const rider = await RiderV2.findOne({ riderId }).lean();
      if (!rider || !rider.documents || !rider.documents[docType]) {
        const error = new Error('Document not found');
        error.statusCode = 404;
        throw error;
      }
      const doc = rider.documents[docType];
      return {
        id: documentId,
        riderId: rider.riderId,
        riderName: rider.name,
        documentType: DOC_TYPE_MAPPING[docType] || docType,
        submittedAt: doc.uploadedAt || rider.updatedAt || rider.createdAt,
        status: doc.status === 'verified' ? 'approved' : 
                doc.status === 'failed' ? 'rejected' : 'pending',
        rejectionReason: doc.rejectionReason || null,
        fileUrl: doc.documentUrl,
        isV2: true
      };
    }

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

    // Handle RiderV2 document review
    if (documentId.startsWith('RDR_V2_')) {
      const [,, riderId, docType] = documentId.split('_');
      
      const v2Status = action === 'approve' ? 'verified' : 
                      (action === 'reject' || action === 'request_resubmission') ? 'failed' : 'pending';
      
      const updateData = {};
      updateData[`documents.${docType}.status`] = v2Status;
      if (rejectionReason) {
        updateData[`documents.${docType}.rejectionReason`] = rejectionReason;
      }
      
      const updatedRider = await RiderV2.findOneAndUpdate(
        { riderId },
        { $set: updateData },
        { new: true }
      );

      if (!updatedRider) {
        const error = new Error('Rider not found');
        error.statusCode = 404;
        throw error;
      }

      // Check if all required documents are now verified
      const requiredDocs = ['aadhar', 'pan', 'drivingLicense'];
      const allVerified = requiredDocs.every(type => 
        updatedRider.documents && 
        updatedRider.documents[type] && 
        updatedRider.documents[type].status === 'verified'
      );

      if (allVerified && updatedRider.status === 'pending') {
        await RiderV2.updateOne({ riderId }, { $set: { status: 'approved' } });
      }

      const doc = updatedRider.documents[docType];
      return {
        id: documentId,
        riderId: updatedRider.riderId,
        riderName: updatedRider.name,
        documentType: DOC_TYPE_MAPPING[docType] || docType,
        submittedAt: doc.uploadedAt,
        status: doc.status === 'verified' ? 'approved' : 
                doc.status === 'failed' ? 'rejected' : 'pending',
        rejectionReason: doc.rejectionReason || null,
        fileUrl: doc.documentUrl,
        isV2: true
      };
    }

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

