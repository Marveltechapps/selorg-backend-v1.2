const express = require('express');
const {
  getSKUs,
  createSKU,
  updateSKU,
  deleteSKU,
  getCollections,
  createCollection,
  updateCollection,
  deleteCollection
} = require('../controllers/catalogController');

const router = express.Router();

router.route('/skus')
  .get(getSKUs)
  .post(createSKU);

router.route('/skus/:id')
  .put(updateSKU)
  .delete(deleteSKU);

router.route('/collections')
  .get(getCollections)
  .post(createCollection);

router.route('/collections/:id')
  .put(updateCollection)
  .delete(deleteCollection);

module.exports = router;
