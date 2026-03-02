/**
 * Bank routes – from frontend YAML (application-spec paths /bank/*).
 */
const express = require('express');
const bankController = require('../controllers/bank.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/verify', requireAuth, bankController.verify);

router.get('/accounts', requireAuth, bankController.listAccounts);
router.post('/accounts', requireAuth, bankController.createAccount);
router.put('/accounts/:accountId', requireAuth, bankController.updateAccount);
router.put('/accounts/:accountId/set-default', requireAuth, bankController.setDefault);
router.post('/accounts/:accountId/delete', requireAuth, bankController.deleteAccount);

module.exports = router;
