'use strict';

const express = require('express');
const { validateQuery, validateBody, validateParams } = require('../middleware/validateZod.middleware');
const { patchProviderParams, patchProviderBody, analyticsCostQuery } = require('../validators/admin.zod');
const logisticsAdmin = require('../controllers/logisticsAdmin.controller');

const router = express.Router();

router.get('/providers', logisticsAdmin.listProviders);
router.patch('/providers/:id', validateParams(patchProviderParams), validateBody(patchProviderBody), logisticsAdmin.patchProvider);
router.get('/analytics/cost-per-route', validateQuery(analyticsCostQuery), logisticsAdmin.costPerRoute);
router.get('/analytics/sla-breaches', logisticsAdmin.slaBreaches);
router.get('/analytics/kpis', logisticsAdmin.kpis);

module.exports = router;
