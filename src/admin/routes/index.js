const express = require('express');
const { authenticateToken, requireRole } = require('../../core/middleware');
const authRoutes = require('./authRoutes');
const roleRoutes = require('./roleRoutes');
const permissionRoutes = require('./permissionRoutes');
const userRoutes = require('./userRoutes');
const storeWarehouseRoutes = require('./storeWarehouseRoutes');
const storeWarehouseSubRoutes = require('./storeWarehouseSubRoutes');
const masterDataRoutes = require('./masterDataRoutes');
const riderMasterDataRoutes = require('./riderMasterDataRoutes');
const auditLogsRoutes = require('./auditLogsRoutes');
const accessLogsRoutes = require('./accessLogsRoutes');
const sessionsRoutes = require('./sessionsRoutes');
const cacheRoutes = require('./cacheRoutes');
const systemRoutes = require('./systemRoutes');
const integrationRoutes = require('./integrationRoutes');
const adminSupportRoutes = require('./adminSupportRoutes');
const notificationsRoutes = require('./notificationsRoutes');
const fraudRoutes = require('./fraudRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const complianceRoutes = require('./complianceRoutes');
const applicationsRoutes = require('./applicationsRoutes');
const customerRoutes = require('./customerRoutes');

const router = express.Router();

// Auth (login only) - no JWT required
router.use('/auth', authRoutes);

// All other routes require JWT and role: admin, super_admin
const protectedRouter = express.Router();
protectedRouter.use(authenticateToken, requireRole('admin', 'super_admin'));
protectedRouter.use('/roles', roleRoutes);
protectedRouter.use('/permissions', permissionRoutes);
protectedRouter.use('/users', userRoutes);
// Master data (cities, zones, vehicle-types, sku-units) before storeWarehouse to avoid route shadowing
protectedRouter.use('/', masterDataRoutes);
protectedRouter.use('/', storeWarehouseRoutes);
protectedRouter.use('/store-warehouse', storeWarehouseSubRoutes);
protectedRouter.use('/', riderMasterDataRoutes);
protectedRouter.use('/audit', auditLogsRoutes);
protectedRouter.use('/access-logs', accessLogsRoutes);
protectedRouter.use('/sessions', sessionsRoutes);
protectedRouter.use('/cache', cacheRoutes);
protectedRouter.use('/system', systemRoutes);
protectedRouter.use('/integrations', integrationRoutes);
protectedRouter.use('/applications', applicationsRoutes);
protectedRouter.use('/analytics', analyticsRoutes);
protectedRouter.use('/support', adminSupportRoutes);
protectedRouter.use('/notifications', notificationsRoutes);
protectedRouter.use('/fraud', fraudRoutes);
protectedRouter.use('/compliance', complianceRoutes);
protectedRouter.use('/customers', customerRoutes);
router.use(protectedRouter);

module.exports = router;
