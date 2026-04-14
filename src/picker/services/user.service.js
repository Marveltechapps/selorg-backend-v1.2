/**
 * User service – from backend-workflow.yaml (user_profile_upsert, location_type_set, upi_upsert).
 * When user is linked to HHD (hhdUserId), profile includes linkedHhdProfile for same-person context.
 */
const mongoose = require('mongoose');
const User = require('../models/user.model');
const HHDUser = require('../../hhd/models/User.model');
const Document = require('../models/document.model');
const BankAccount = require('../models/bankAccount.model');
const PickerDevice = require('../models/device.model');
const SupportTicket = require('../models/supportTicket.model');
const Notification = require('../models/notification.model');
const TrainingVideo = require('../models/trainingVideo.model');
const WatchHistory = require('../models/watchHistory.model');
const { uploadPickerProfileImage } = require('../../utils/s3Upload');
const { buildDocumentPayload } = require('./documents.service');

const updateProfile = async (userId, body) => {
  const set = {};
  if (body.name != null) set.name = body.name;
  if (body.age != null) set.age = body.age;
  if (body.gender != null) set.gender = body.gender;
  if (body.email != null) set.email = body.email;
  if (body.phone != null) set.phone = body.phone;
  
  // Handle profile image upload to S3
  if (body.photoUri != null) {
    // Check if it's a base64 image (starts with data: or is pure base64)
    if (body.photoUri.startsWith('data:') || body.photoUri.startsWith('/9j/') || body.photoUri.startsWith('iVBOR')) {
      try {
        // Upload to S3 and get the URL
        const s3Url = await uploadPickerProfileImage(userId, body.photoUri);
        set.photoUri = s3Url;
      } catch (error) {
        console.error('[User Service] Failed to upload profile image to S3:', error);
        throw new Error('Failed to upload profile image');
      }
    } else {
      // Already an S3 URL or external URL, just save it
      set.photoUri = body.photoUri;
    }
  }
  
  const user = await User.findByIdAndUpdate(userId, { $set: set }, { new: true }).lean();
  return user || null;
};

const setLocationType = async (userId, locationType) => {
  if (!['warehouse', 'darkstore'].includes(locationType)) return null;
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { locationType } },
    { new: true }
  ).lean();
  return user || null;
};

const setSelectedShifts = async (userId, selectedShifts) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { selectedShifts: selectedShifts || [] } },
    { new: true }
  ).lean();
  return user || null;
};

const setUpi = async (userId, upiId, upiName) => {
  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        upiId,
        upiName,
        upiPayoutVerificationStatus: 'pending',
        upiPayoutRejectionReason: '',
      },
    },
    { new: true }
  ).lean();
  return user || null;
};

const getById = async (userId) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return null;
  return User.findById(userId).lean();
};

/** GET profile: return current user profile for app display; include status, rejectedReason, rejectedAt for picker approval flow; include linked HHD profile when same person. */
const getProfile = async (userId) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return null;
  const user = await User.findById(userId).lean();
  if (!user) return null;
  const profile = {
    id: user._id.toString(),
    name: user.name,
    phone: user.phone,
    email: user.email,
    age: user.age,
    gender: user.gender,
    photoUri: user.photoUri,
    createdAt: user.createdAt,
    selectedShifts: user.selectedShifts || [],
    locationType: user.locationType,
    trainingProgress: user.trainingProgress || {},
    upiId: user.upiId,
    upiName: user.upiName,
    upiPayoutVerificationStatus:
      user.upiId && (!user.upiPayoutVerificationStatus || user.upiPayoutVerificationStatus === 'none')
        ? 'pending'
        : user.upiPayoutVerificationStatus || 'none',
    upiPayoutRejectionReason: user.upiPayoutRejectionReason || '',
    status: user.status,
    rejectedReason: user.rejectedReason,
    rejectedAt: user.rejectedAt ? user.rejectedAt.toISOString() : null,
  };
  if (user.hhdUserId) {
    try {
      const hhd = await HHDUser.findById(user.hhdUserId).select('name mobile role isActive').lean();
      if (hhd) {
        profile.linkedHhdProfile = {
          name: hhd.name,
          mobile: hhd.mobile,
          role: hhd.role,
          isActive: hhd.isActive,
        };
        if (!profile.name && hhd.name) {
          profile.name = hhd.name;
        }
        if (!profile.phone && hhd.mobile) {
          profile.phone = hhd.mobile;
        }
      }
    } catch (_) {}
  }
  return profile;
};

const getProfileOverview = async (userId) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return null;

  const [user, documentRecords, bankAccounts, assignedDevice, openTicketsCount, unreadNotificationsCount, activeVideos, watchHistory] =
    await Promise.all([
      User.findById(userId).lean(),
      Document.find({ userId }).lean(),
      BankAccount.find({ userId }).sort({ isDefault: -1, createdAt: -1 }).lean(),
      PickerDevice.findOne({ assignedPickerId: userId }).lean(),
      SupportTicket.countDocuments({ userId, status: { $in: ['open', 'in_progress'] } }),
      Notification.countDocuments({ userId, isRead: false }),
      TrainingVideo.find({ isActive: true }).sort({ order: 1 }).lean(),
      WatchHistory.find({ userId }).lean(),
    ]);

  if (!user) return null;

  const profile = await getProfile(userId);
  const documentPayload = buildDocumentPayload(documentRecords || []);

  const defaultBankAccount = (bankAccounts || []).find((account) => account.isDefault) || bankAccounts?.[0] || null;
  const verifiedBankAccount = (bankAccounts || []).find((account) => account.isVerified) || null;

  const watchHistoryMap = new Map((watchHistory || []).map((entry) => [entry.videoId, entry]));
  const totalTrainingVideos = activeVideos?.length || 0;
  let completedTrainingVideos = 0;
  let totalProgressPercent = 0;

  for (const video of activeVideos || []) {
    const history = watchHistoryMap.get(video.videoId);
    const completed = !!history?.completedAt || user?.trainingProgress?.[video.videoId] === 100;
    if (completed) {
      completedTrainingVideos += 1;
      totalProgressPercent += 100;
      continue;
    }

    const watchedSeconds = Math.max(0, history?.watchedSeconds || 0);
    const progressPercent = video.duration > 0 ? Math.min(99, Math.round((watchedSeconds / video.duration) * 100)) : 0;
    totalProgressPercent += progressPercent;
  }

  const trainingProgressPercent =
    totalTrainingVideos > 0 ? Math.round(totalProgressPercent / totalTrainingVideos) : 0;

  const bankSummary = {
    hasAnyAccount: bankAccounts.length > 0,
    hasVerifiedAccount: !!verifiedBankAccount,
    defaultAccountId: defaultBankAccount?._id?.toString() || null,
    defaultAccountMasked: defaultBankAccount?.accountNumber
      ? `****${String(defaultBankAccount.accountNumber).slice(-4)}`
      : null,
    defaultBankName: defaultBankAccount?.bankName || null,
    upiId: profile?.upiId || null,
    upiName: profile?.upiName || null,
  };

  return {
    picker: {
      id: profile.id,
      name: profile.name || null,
      phone: profile.phone || null,
      email: profile.email || null,
      photoUri: profile.photoUri || null,
      joinedAt: profile.createdAt || null,
      status: profile.status || null,
      role: user?.employment?.role || null,
      locationType: profile.locationType || null,
    },
    documents: documentPayload.summary,
    documentDetails: documentPayload.details,
    bank: bankSummary,
    training: {
      totalVideos: totalTrainingVideos,
      completedVideos: completedTrainingVideos,
      progressPercent: trainingProgressPercent,
      completed: totalTrainingVideos > 0 && completedTrainingVideos === totalTrainingVideos,
    },
    device: {
      assigned: !!assignedDevice,
      deviceId: assignedDevice?.deviceId || null,
      serial: assignedDevice?.serial || null,
      status: assignedDevice?.status || null,
      assignedAt: assignedDevice?.assignedAt ? new Date(assignedDevice.assignedAt).toISOString() : null,
    },
    support: {
      openTicketsCount,
    },
    notifications: {
      unreadCount: unreadNotificationsCount,
    },
  };
};

/** Link status for same-person context (Picker ↔ HHD). */
const getLinkStatus = async (userId) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return { linked: false };
  const user = await User.findById(userId).select('hhdUserId').lean();
  return {
    linked: !!user?.hhdUserId,
    hhdUserId: user?.hhdUserId?.toString() || null,
  };
};

/** Contract info (shared DB single source). */
const getContract = async (userId) => {
  const user = await User.findById(userId).select('contractInfo').lean();
  return user?.contractInfo || {};
};

const updateContract = async (userId, body) => {
  const set = {};
  if (body.legalName != null) set['contractInfo.legalName'] = body.legalName;
  if (body.contractStartDate != null) set['contractInfo.contractStartDate'] = body.contractStartDate;
  if (body.documentId != null) set['contractInfo.documentId'] = body.documentId;
  await User.updateOne({ _id: userId }, { $set: set });
  return getContract(userId);
};

/** Employment details (shared DB single source). */
const getEmployment = async (userId) => {
  const user = await User.findById(userId).select('employment').lean();
  return user?.employment || {};
};

const updateEmployment = async (userId, body) => {
  const set = {};
  const keys = ['joiningDate', 'role', 'shiftType', 'employerName', 'employeeId', 'department'];
  keys.forEach((k) => {
    if (body[k] !== undefined) set[`employment.${k}`] = body[k];
  });
  await User.updateOne({ _id: userId }, { $set: set });
  return getEmployment(userId);
};

module.exports = {
  updateProfile,
  setLocationType,
  setSelectedShifts,
  setUpi,
  getById,
  getProfile,
  getProfileOverview,
  getLinkStatus,
  getContract,
  updateContract,
  getEmployment,
  updateEmployment,
};
