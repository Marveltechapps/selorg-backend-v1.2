const documentService = require('../services/documentService');

const listDocuments = async (req, res, next) => {
  try {
    const { status, documentType, page, limit } = req.query;
    const result = await documentService.listDocuments(
      { status, documentType },
      { page, limit }
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getDocumentDetails = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const document = await documentService.getDocumentDetails(documentId);
    res.status(200).json(document);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ error: 'Not Found', message: error.message });
    }
    next(error);
  }
};

const reviewDocument = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const { action, notes, rejectionReason, reviewer } = req.body;
    const document = await documentService.reviewDocument(documentId, {
      action,
      notes,
      rejectionReason,
      reviewer,
    });
    res.status(200).json(document);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ error: 'Not Found', message: error.message });
    }
    if (error.statusCode === 400) {
      return res.status(400).json({ error: 'Bad Request', message: error.message });
    }
    next(error);
  }
};

const getDocumentRejectionReason = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const result = await documentService.getDocumentRejectionReason(documentId);
    res.status(200).json(result);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ error: 'Not Found', message: error.message });
    }
    next(error);
  }
};

const getDocumentHistory = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const result = await documentService.getDocumentHistory(documentId);
    res.status(200).json(result);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ error: 'Not Found', message: error.message });
    }
    next(error);
  }
};

module.exports = {
  listDocuments,
  getDocumentDetails,
  reviewDocument,
  getDocumentRejectionReason,
  getDocumentHistory,
};
