const { ErrorResponse } = require('../../utils/ErrorResponse');
const HHDPhoto = require('../../models/Photo.model');
const { getFileUrl } = require('../../services/fileUpload.service');

async function uploadPhoto(req, res, next) {
  try {
    const userId = req.user?.id;
    const { orderId, bagId } = req.body;
    if (!orderId || !bagId) throw new ErrorResponse('Please provide orderId and bagId', 400);
    if (!req.file) throw new ErrorResponse('Please upload a photo', 400);
    const photoUrl = getFileUrl(req.file.filename);
    const photo = await HHDPhoto.create({
      orderId,
      bagId,
      userId,
      photoUrl,
      photoKey: req.file.filename,
    });
    res.status(201).json({ success: true, data: photo });
  } catch (error) {
    next(error);
  }
}

async function getPhoto(req, res, next) {
  try {
    const { orderId, bagId } = req.params;
    const photo = await HHDPhoto.findOne({ orderId, bagId });
    if (!photo) throw new ErrorResponse('Photo not found', 404);
    res.status(200).json({ success: true, data: photo });
  } catch (error) {
    next(error);
  }
}

async function verifyPhoto(req, res, next) {
  try {
    const { photoId } = req.params;
    const photo = await HHDPhoto.findById(photoId);
    if (!photo) throw new ErrorResponse(`Photo not found with id of ${photoId}`, 404);
    photo.verified = true;
    photo.verifiedAt = new Date();
    await photo.save();
    res.status(200).json({ success: true, data: photo });
  } catch (error) {
    next(error);
  }
}

module.exports = { uploadPhoto, getPhoto, verifyPhoto };
