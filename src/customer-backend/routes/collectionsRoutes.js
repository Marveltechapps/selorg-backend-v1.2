const { Router } = require('express');
const { getCollectionBySlug } = require('../controllers/collectionsController');

const router = Router();
router.get('/:slug', getCollectionBySlug);
module.exports = router;
