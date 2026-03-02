/**
 * Faq controller – from backend-workflow.yaml (faqs_list).
 */
const faqService = require('../services/faq.service');
const { success } = require('../utils/response.util');

const list = async (req, res, next) => {
  try {
    const data = await faqService.list();
    success(res, data);
  } catch (err) {
    next(err);
  }
};

module.exports = { list };
