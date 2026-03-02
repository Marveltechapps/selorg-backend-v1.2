const { asyncHandler } = require('../../core/middleware');
const ErrorResponse = require('../../core/utils/ErrorResponse');
const mongoose = require('mongoose');

// Rider model - rider_v2_backend
let Rider;
try {
  Rider = require('../../rider_v2_backend/src/models/Rider').Rider || require('../../rider_v2_backend/src/models/Rider');
} catch (e) {
  Rider = null;
}

function transformRider(doc) {
  if (!doc) return null;
  return {
    id: doc._id?.toString(),
    riderId: doc.riderId,
    name: doc.name,
    phone: doc.phoneNumber,
    email: doc.email || '',
    vehicleType: doc.vehicle?.type || 'bike',
    status: doc.status,
    availability: doc.availability,
    cityName: doc.preferredLocation?.cityName || '',
    cityId: doc.preferredLocation?.cityId || '',
    stats: {
      totalDeliveries: doc.stats?.totalDeliveries ?? 0,
      averageRating: doc.stats?.averageRating ?? 0,
      completedDeliveries: doc.stats?.completedDeliveries ?? 0,
    },
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

const listRiders = asyncHandler(async (req, res) => {
  if (!Rider) {
    return res.json({ success: true, data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  }
  const { status, availability, cityId, search, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (availability) filter.availability = availability;
  if (cityId) filter['preferredLocation.cityId'] = cityId;
  if (search && search.trim()) {
    const s = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: s, $options: 'i' } },
      { phoneNumber: { $regex: s, $options: 'i' } },
      { riderId: { $regex: s, $options: 'i' } },
    ];
  }
  const skip = Math.max(0, (parseInt(page, 10) - 1) * parseInt(limit, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const [riders, total] = await Promise.all([
    Rider.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    Rider.countDocuments(filter),
  ]);
  const totalPages = Math.ceil(total / limitNum);
  res.json({
    success: true,
    data: riders.map(transformRider),
    pagination: { page: parseInt(page, 10), limit: limitNum, total, totalPages },
  });
});

const getRider = asyncHandler(async (req, res) => {
  if (!Rider) throw new ErrorResponse('Riders module not available', 503);
  const { id } = req.params;
  let rider = await Rider.findById(id).lean();
  if (!rider && mongoose.Types.ObjectId.isValid(id)) {
    rider = await Rider.findOne({ riderId: id }).lean();
  }
  if (!rider) throw new ErrorResponse('Rider not found', 404);
  res.json({ success: true, data: transformRider(rider) });
});

const updateRiderStatus = asyncHandler(async (req, res) => {
  if (!Rider) throw new ErrorResponse('Riders module not available', 503);
  const { id } = req.params;
  const { status, availability } = req.body;
  let rider = await Rider.findById(id);
  if (!rider && mongoose.Types.ObjectId.isValid(id)) {
    rider = await Rider.findOne({ riderId: id });
  }
  if (!rider) throw new ErrorResponse('Rider not found', 404);
  if (status) {
    const valid = ['pending', 'approved', 'active', 'inactive', 'suspended'];
    if (!valid.includes(status)) throw new ErrorResponse('Invalid status', 400);
    rider.status = status;
  }
  if (availability !== undefined) {
    const valid = ['available', 'busy', 'offline'];
    if (!valid.includes(availability)) throw new ErrorResponse('Invalid availability', 400);
    rider.availability = availability;
  }
  await rider.save();
  const populated = await Rider.findById(rider._id).lean();
  res.json({ success: true, data: transformRider(populated) });
});

module.exports = {
  listRiders,
  getRider,
  updateRiderStatus,
};
