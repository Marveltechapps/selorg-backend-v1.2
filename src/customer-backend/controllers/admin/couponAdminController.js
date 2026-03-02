const { Coupon } = require('../../models/Coupon');

exports.list = async (req, res) => {
  try {
    const { search, isActive, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Coupon.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      Coupon.countDocuments(filter),
    ]);
    res.json({ success: true, data: items, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const item = await Coupon.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ success: false, error: 'Coupon not found' });
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { code, description, discountType, discountValue, minOrderAmount, maxDiscountAmount, validFrom, validTo, isActive, usageLimit } = req.body;
    if (!code || discountValue === undefined) {
      return res.status(400).json({ success: false, error: 'code and discountValue are required' });
    }
    const existing = await Coupon.findOne({ code: code.toUpperCase() }).lean();
    if (existing) {
      return res.status(409).json({ success: false, error: 'Coupon code already exists' });
    }
    const created = await Coupon.create({
      code: code.toUpperCase(),
      description,
      discountType: discountType || 'percent',
      discountValue,
      minOrderAmount: minOrderAmount || 0,
      maxDiscountAmount: maxDiscountAmount || null,
      validFrom: validFrom || null,
      validTo: validTo || null,
      isActive: isActive !== false,
      usageLimit: usageLimit || null,
    });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const body = { ...req.body };
    delete body._id;
    if (body.code) body.code = body.code.toUpperCase();
    const updated = await Coupon.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true }).lean();
    if (!updated) return res.status(404).json({ success: false, error: 'Coupon not found' });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const deleted = await Coupon.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Coupon not found' });
    res.json({ success: true, message: 'Coupon deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.stats = async (req, res) => {
  try {
    const [total, active, expired] = await Promise.all([
      Coupon.countDocuments(),
      Coupon.countDocuments({ isActive: true }),
      Coupon.countDocuments({ validTo: { $lt: new Date() } }),
    ]);
    const totalRedemptions = await Coupon.aggregate([
      { $group: { _id: null, count: { $sum: '$usageCount' } } },
    ]);
    res.json({
      success: true,
      data: {
        total,
        active,
        expired,
        inactive: total - active,
        totalRedemptions: totalRedemptions[0]?.count || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
