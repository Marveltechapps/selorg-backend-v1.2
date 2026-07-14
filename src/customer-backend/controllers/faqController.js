const mongoose = require('mongoose');
const { FaqItem } = require('../models/FaqItem');
const { FaqFeedback } = require('../models/FaqFeedback');
const { FAQ_CATEGORIES } = require('../data/faqSeedContent');
const { isDummyCatalogLabel } = require('../utils/filterDummyCatalog');

function parseHelpful(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes') return true;
    if (v === 'false' || v === '0' || v === 'no') return false;
  }
  return null;
}

function mapFaqItem(item) {
  return {
    id: item._id.toString(),
    _id: item._id.toString(),
    question: item.question,
    answer: item.answer,
    order: item.order,
    category: item.category || '',
    helpfulCount: item.helpfulCount || 0,
    notHelpfulCount: item.notHelpfulCount || 0,
  };
}

/** Public API - returns active FAQ items for customer app */
exports.list = async (req, res) => {
  try {
    const { category } = req.query;
    const filter = { isActive: true };
    if (category && String(category).trim()) {
      filter.category = String(category).trim();
    }

    const items = await FaqItem.find(filter)
      .sort({ order: 1, createdAt: 1 })
      .select('question answer order category helpfulCount notHelpfulCount')
      .lean();

    const filtered = (items || []).filter((item) => {
      if (isDummyCatalogLabel(item.question)) return false;
      const answer = String(item.answer || '').trim();
      return !(answer && isDummyCatalogLabel(answer));
    });

    res.json({
      success: true,
      data: filtered.map(mapFaqItem),
      categories: FAQ_CATEGORIES,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/** Public API - FAQ category catalog */
exports.listCategories = async (_req, res) => {
  try {
    res.json({
      success: true,
      data: FAQ_CATEGORIES.map((name, index) => ({
        id: name.toLowerCase().replace(/\s+/g, '_'),
        name,
        order: index + 1,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /faq/:id/feedback
 * Body: { helpful: boolean }
 * Auth required. One vote per user per FAQ.
 */
exports.submitFeedback = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const faqId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(faqId)) {
      return res.status(400).json({ success: false, error: 'Invalid FAQ id' });
    }

    const helpful = parseHelpful(req.body?.helpful);
    if (helpful === null) {
      return res.status(400).json({
        success: false,
        error: 'helpful must be a boolean (true | false)',
      });
    }

    const faq = await FaqItem.findById(faqId);
    if (!faq || !faq.isActive) {
      return res.status(404).json({ success: false, error: 'FAQ not found' });
    }

    const existing = await FaqFeedback.findOne({
      faqId: faq._id,
      userId: String(userId),
    }).lean();

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'You have already voted on this FAQ',
        data: {
          faqId: faq._id.toString(),
          helpful: existing.helpful,
          alreadyVoted: true,
          helpfulCount: faq.helpfulCount || 0,
          notHelpfulCount: faq.notHelpfulCount || 0,
        },
      });
    }

    await FaqFeedback.create({
      faqId: faq._id,
      userId: String(userId),
      helpful,
    });

    if (helpful) {
      faq.helpfulCount = (faq.helpfulCount || 0) + 1;
    } else {
      faq.notHelpfulCount = (faq.notHelpfulCount || 0) + 1;
    }
    await faq.save();

    return res.status(201).json({
      success: true,
      data: {
        faqId: faq._id.toString(),
        helpful,
        helpfulCount: faq.helpfulCount,
        notHelpfulCount: faq.notHelpfulCount,
      },
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'You have already voted on this FAQ',
      });
    }
    res.status(500).json({ success: false, error: err.message });
  }
};
