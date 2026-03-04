const { getPageBySlug } = require('../services/cms/pageService');

async function getPage(req, res) {
  try {
    const { slug } = req.params;
    const siteId = req.query.siteId || req.headers['x-site-id'] || null;
    const page = await getPageBySlug(slug, siteId);
    if (!page) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }
    res.status(200).json({ success: true, data: page });
  } catch (err) {
    console.error('getPage error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { getPage };
