const express = require('express');
const accountController = require('../controllers/account.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/delete-request', requireAuth, accountController.postDeleteRequest);

module.exports = router;
