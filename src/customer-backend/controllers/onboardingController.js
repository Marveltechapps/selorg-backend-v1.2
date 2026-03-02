const { OnboardingPage } = require('../models/OnboardingPage');
const { CustomerUser } = require('../models/CustomerUser');
const { onboardingStatusSchema } = require('../validators/onboardingSchemas');

function toPageDto(doc) {
  return {
    _id: String(doc._id),
    pageNumber: doc.pageNumber,
    title: doc.title,
    description: doc.description,
    imageUrl: doc.imageUrl,
    ...(doc.ctaText != null && { ctaText: doc.ctaText }),
    ...(doc.isActive != null && { isActive: doc.isActive }),
    ...(doc.order != null && { order: doc.order }),
    ...(doc.createdAt && { createdAt: doc.createdAt.toISOString() }),
    ...(doc.updatedAt && { updatedAt: doc.updatedAt.toISOString() }),
  };
}

function toStatusDto(completed, completedAt) {
  return onboardingStatusSchema.parse({
    onboardingCompleted: completed,
    onboardingCompletedAt: completedAt ? completedAt.toISOString() : null,
  });
}

async function getPages(_req, res) {
  try {
    const pages = await OnboardingPage.find({ isActive: true }).sort({ order: 1, pageNumber: 1 }).lean();
    const data = pages.map(toPageDto);
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('getPages error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function getPageByNumber(req, res) {
  try {
    const pageNumber = Number(req.params.pageNumber);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      res.status(400).json({ success: false, message: 'Invalid page number' });
      return;
    }
    const page = await OnboardingPage.findOne({ pageNumber, isActive: true }).lean();
    if (!page) {
      res.status(404).json({ success: false, message: 'Page not found' });
      return;
    }
    res.status(200).json({ success: true, data: toPageDto(page) });
  } catch (err) {
    console.error('getPageByNumber error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function completeOnboarding(req, res) {
  try {
    if (req.user?._id) {
      const user = await CustomerUser.findByIdAndUpdate(
        req.user._id,
        { onboardingCompleted: true, onboardingCompletedAt: new Date() },
        { new: true }
      ).lean();
      if (user) {
        const completedAt = user.onboardingCompletedAt instanceof Date ? user.onboardingCompletedAt : null;
        res.status(200).json({ success: true, data: toStatusDto(true, completedAt) });
        return;
      }
    }
    res.status(200).json({ success: true, data: toStatusDto(true, null) });
  } catch (err) {
    console.error('completeOnboarding error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function getStatus(req, res) {
  try {
    if (req.user?._id) {
      const user = await CustomerUser.findById(req.user._id).lean();
      if (user) {
        const completedAt = user.onboardingCompletedAt instanceof Date ? user.onboardingCompletedAt : null;
        res.status(200).json({ success: true, data: toStatusDto(!!user.onboardingCompleted, completedAt) });
        return;
      }
    }
    res.status(200).json({ success: true, data: toStatusDto(false, null) });
  } catch (err) {
    console.error('getStatus error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { getPages, getPageByNumber, completeOnboarding, getStatus };
