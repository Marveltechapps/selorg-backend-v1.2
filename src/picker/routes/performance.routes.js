const express = require('express');
const { requireAuth } = require('../middlewares/auth.middleware');
const { attachHhdUserId, requireLinkedHhdUser } = require('../helpers/hhdLink.helper');
const controller = require('../controllers/performance.controller');

const router = express.Router();

router.use(requireAuth);
router.use(attachHhdUserId);
router.use(requireLinkedHhdUser);

router.get('/summary', controller.getSummary);
router.get('/history', controller.getHistory);

module.exports = router;
