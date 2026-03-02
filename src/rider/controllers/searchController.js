const searchService = require('../services/search/searchService');

const unifiedSearch = async (req, res, next) => {
  try {
    const { q, type = 'all', limit = 10 } = req.query;
    
    const results = await searchService.unifiedSearch(q, type, parseInt(limit));
    
    res.status(200).json(results);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  unifiedSearch,
};

