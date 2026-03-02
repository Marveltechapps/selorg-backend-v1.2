const { OnboardingPage } = require('../../models/OnboardingPage');
const { uploadProductImage: uploadBase64ImageToS3 } = require('../../../utils/s3Upload');

function toDto(doc) {
  return {
    _id: String(doc._id),
    pageNumber: doc.pageNumber,
    title: doc.title,
    description: doc.description,
    imageUrl: doc.imageUrl,
    ctaText: doc.ctaText ?? null,
    isActive: doc.isActive ?? true,
    order: doc.order ?? doc.pageNumber,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

exports.list = async (_req, res) => {
  try {
    const pages = await OnboardingPage.find().sort({ order: 1, pageNumber: 1 }).lean();
    res.json({ success: true, data: pages.map(toDto) });
  } catch (err) {
    console.error('Admin onboarding list error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const { title, description, imageUrl, ctaText, isActive } = req.body;
    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'title and description are required' });
    }

    const maxPage = await OnboardingPage.findOne().sort({ pageNumber: -1 }).lean();
    const nextPageNumber = (maxPage?.pageNumber ?? 0) + 1;

    const maxOrder = await OnboardingPage.findOne().sort({ order: -1 }).lean();
    const nextOrder = (maxOrder?.order ?? 0) + 1;

    const page = await OnboardingPage.create({
      pageNumber: nextPageNumber,
      title,
      description,
      imageUrl: imageUrl || '',
      ctaText: ctaText || undefined,
      isActive: isActive !== false,
      order: nextOrder,
    });

    res.status(201).json({ success: true, data: toDto(page.toObject()) });
  } catch (err) {
    console.error('Admin onboarding create error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};
    const allowed = ['title', 'description', 'imageUrl', 'ctaText', 'isActive', 'order', 'pageNumber'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const page = await OnboardingPage.findByIdAndUpdate(id, updates, { new: true }).lean();
    if (!page) {
      return res.status(404).json({ success: false, message: 'Onboarding page not found' });
    }
    res.json({ success: true, data: toDto(page) });
  } catch (err) {
    console.error('Admin onboarding update error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const page = await OnboardingPage.findByIdAndDelete(id);
    if (!page) {
      return res.status(404).json({ success: false, message: 'Onboarding page not found' });
    }

    const remaining = await OnboardingPage.find().sort({ order: 1 }).lean();
    if (remaining.length > 0) {
      // Phase 1: temp pageNumbers to avoid unique constraint
      const tempOps = remaining.map((p, idx) => ({
        updateOne: {
          filter: { _id: p._id },
          update: { $set: { pageNumber: 10000 + idx, order: idx + 1 } },
        },
      }));
      await OnboardingPage.bulkWrite(tempOps);
      // Phase 2: final pageNumbers
      const finalOps = remaining.map((p, idx) => ({
        updateOne: {
          filter: { _id: p._id },
          update: { $set: { pageNumber: idx + 1 } },
        },
      }));
      await OnboardingPage.bulkWrite(finalOps);
    }

    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    console.error('Admin onboarding delete error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.reorder = async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({ success: false, message: 'order must be a non-empty array of page IDs' });
    }

    // Phase 1: set pageNumber to high temp values to avoid unique constraint conflicts
    const tempOps = order.map((id, idx) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { pageNumber: 10000 + idx, order: idx + 1 } },
      },
    }));
    await OnboardingPage.bulkWrite(tempOps);

    // Phase 2: set final pageNumber values
    const finalOps = order.map((id, idx) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { pageNumber: idx + 1 } },
      },
    }));
    await OnboardingPage.bulkWrite(finalOps);

    const pages = await OnboardingPage.find().sort({ order: 1 }).lean();
    res.json({ success: true, data: pages.map(toDto) });
  } catch (err) {
    console.error('Admin onboarding reorder error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.uploadImage = async (req, res) => {
  try {
    const { id } = req.params;
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ success: false, message: 'image (base64) is required' });
    }

    const page = await OnboardingPage.findById(id);
    if (!page) {
      return res.status(404).json({ success: false, message: 'Onboarding page not found' });
    }

    const bucket = process.env.AWS_S3_BUCKET || 'selorg-assets';
    const imageUrl = await uploadBase64ImageToS3(image, bucket, 'onboarding');
    page.imageUrl = imageUrl;
    await page.save();

    res.json({ success: true, data: { imageUrl } });
  } catch (err) {
    console.error('Admin onboarding uploadImage error:', err);
    res.status(500).json({ success: false, message: 'Image upload failed' });
  }
};
