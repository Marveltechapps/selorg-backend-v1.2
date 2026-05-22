const Order = require('../../darkstore/models/Order');
const SKU = require('../../merch/models/SKU');
const AdminUser = require('../../admin/models/User');
const Vendor = require('../../vendor/models/Vendor');
const Rider = require('../../rider/models/Rider');
const InventoryItem = require('../../warehouse/models/InventoryItem');
const RecentSearch = require('../models/RecentSearch');
const logger = require('../../core/utils/logger');
const { mergeWarehouseFilter, warehouseKeyMatch } = require('../../warehouse/constants/warehouseScope');
const PurchaseOrder = require('../../vendor/models/PurchaseOrder');
const { resolveHubKeyFromUserDoc, mergeHubFilterForKey } = require('../../vendor/constants/hubScope');
const CustomerPayment = require('../../finance/models/CustomerPayment');
const VendorInvoice = require('../../finance/models/VendorInvoice');
const Invoice = require('../../finance/models/Invoice');

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDashboard(dashboard) {
  const d = String(dashboard || '').toLowerCase();
  if (d === 'admin' || d === 'warehouse' || d === 'vendor' || d === 'finance') return d;
  return '';
}

const FINANCE_DASHBOARD_KEYS = new Set(['admin', 'warehouse', 'vendor', 'finance']);

function warehouseStoreScope(user) {
  if (!user || typeof user !== 'object') return null;
  const stores = [];
  if (Array.isArray(user.assignedStores)) stores.push(...user.assignedStores);
  if (user.primaryStoreId) stores.push(user.primaryStoreId);
  const uniq = [...new Set(stores.filter(Boolean))];
  if (uniq.length === 0) return null;
  return { store_id: { $in: uniq } };
}

/**
 * Global Search Service — DB-backed only; dashboard scopes which modules run.
 */
class GlobalSearchService {
  /**
   * @param {string} query
   * @param {string} type - all | orders | products | users | vendors | riders | inventory
   * @param {number} limit
   * @param {string|null} userId
   * @param {string} dashboard - '' | admin | warehouse
   * @param {object|null} user - req.user (for warehouse store scoping)
   */
  async globalSearch(query, type = 'all', limit = 10, userId = null, dashboard = '', user = null) {
    if (!query || query.trim().length < 2) {
      return {
        query,
        results: {
          orders: [],
          products: [],
          users: [],
          vendors: [],
          riders: [],
          inventory: [],
        },
        total: 0,
        took: 0,
      };
    }

    const startTime = Date.now();
    const searchTerm = query.trim();
    const searchRegex = new RegExp(escapeRegex(searchTerm), 'i');
    const d = normalizeDashboard(dashboard);
    const storeScope = d === 'warehouse' ? warehouseStoreScope(user) : null;
    const vendorHubKey = d === 'vendor' ? resolveHubKeyFromUserDoc(user) : null;

    const results = {
      orders: [],
      products: [],
      users: [],
      vendors: [],
      riders: [],
      inventory: [],
    };

    const want = (mod) => type === 'all' || type === mod;
    const wantUsers = want('users') && d !== 'warehouse' && d !== 'vendor' && d !== 'finance';
    const financeHubKey = d === 'finance' ? resolveHubKeyFromUserDoc(user) : null;

    try {
      const searchPromises = [];

      if (d === 'finance') {
        if (want('orders')) {
          searchPromises.push(
            CustomerPayment.find({
              $or: [
                { orderId: searchRegex },
                { customerName: searchRegex },
                { customerEmail: searchRegex },
                { gatewayRef: searchRegex },
              ],
            })
              .limit(limit)
              .lean()
              .then((rows) => {
                results.orders = rows.map((row) => {
                  const id = String(row._id);
                  return {
                    id,
                    type: 'customer_payment',
                    title: `Payment ${row.orderId}`,
                    subtitle: row.customerName || row.customerEmail || '',
                    status: row.status || '',
                    metadata: {
                      amount: row.amount,
                      financeTab: 'customer-payments',
                      href: `/finance/customer-payments?highlight=${encodeURIComponent(id)}`,
                    },
                  };
                });
              })
          );
        }

        if (want('vendors')) {
          const invBase = {
            $or: [
              { invoiceNumber: searchRegex },
              { vendorName: searchRegex },
              { vendorId: searchRegex },
            ],
          };
          const invFilter =
            financeHubKey ? mergeHubFilterForKey(invBase, financeHubKey) : invBase;
          searchPromises.push(
            VendorInvoice.find(invFilter)
              .limit(limit)
              .lean()
              .then((rows) => {
                results.vendors = rows.map((row) => {
                  const id = String(row._id);
                  return {
                    id,
                    type: 'vendor_invoice',
                    title: `Invoice ${row.invoiceNumber}`,
                    subtitle: row.vendorName || row.vendorId || '',
                    status: row.status || '',
                    metadata: {
                      amount: row.amount,
                      financeTab: 'vendor-payments',
                      href: `/finance/vendor-payments?highlight=${encodeURIComponent(id)}`,
                    },
                  };
                });
              })
          );
        }

        if (want('products')) {
          searchPromises.push(
            Invoice.find({
              $or: [
                { invoiceNumber: searchRegex },
                { customerName: searchRegex },
                { customerEmail: searchRegex },
              ],
            })
              .limit(limit)
              .lean()
              .then((rows) => {
                results.products = rows.map((row) => {
                  const id = String(row._id);
                  return {
                    id,
                    type: 'billing_invoice',
                    title: `Invoice ${row.invoiceNumber}`,
                    subtitle: row.customerName || row.customerEmail || '',
                    status: row.status || '',
                    metadata: {
                      amount: row.amount,
                      financeTab: 'billing',
                      href: `/finance/billing?highlight=${encodeURIComponent(id)}`,
                    },
                  };
                });
              })
          );
        }

        await Promise.all(searchPromises);

        const total =
          results.orders.length +
          results.products.length +
          results.vendors.length;

        const took = Date.now() - startTime;

        if (userId && total > 0) {
          await this.saveRecentSearch(userId, query, total, d);
        }

        return {
          query,
          results,
          total,
          took,
        };
      }

      if (want('orders') && d !== 'vendor') {
        let orderFilter = {
          $or: [
            { order_id: searchRegex },
            { customer_name: searchRegex },
            { customer_phone: searchRegex },
            { 'items.sku': searchRegex },
            { 'items.name': searchRegex },
            { 'items.productName': searchRegex },
          ],
        };
        if (storeScope) {
          orderFilter = { $and: [storeScope, orderFilter] };
        }
        searchPromises.push(
          Order.find(orderFilter)
            .limit(limit)
            .lean()
            .then((orders) => {
              results.orders = orders.map((order) => ({
                id: order.order_id || order.id,
                type: 'order',
                title: `Order ${order.order_id}`,
                subtitle: order.customer_name || 'Unknown Customer',
                status: order.status,
                metadata: {
                  amount: order.total_amount ?? order.total_bill,
                  items: order.items?.length || 0,
                  created_at: order.created_at,
                  store_id: order.store_id,
                },
              }));
            })
        );
      }

      if (want('products') && d !== 'vendor') {
        searchPromises.push(
          SKU.find({
            $or: [
              { name: searchRegex },
              { code: searchRegex },
              { brand: searchRegex },
              { category: searchRegex },
              { tags: searchRegex },
            ],
          })
            .limit(limit)
            .lean()
            .then((products) => {
              results.products = products.map((product) => ({
                id: product.code || String(product._id),
                type: 'product',
                title: product.name,
                subtitle: product.code || '',
                status: product.marginStatus || '',
                metadata: {
                  price: product.sellingPrice,
                  stock: product.stock,
                  category: product.category,
                },
              }));
            })
        );
      }

      if (wantUsers) {
        searchPromises.push(
          AdminUser.find({
            $or: [
              { name: searchRegex },
              { email: searchRegex },
              { role: searchRegex },
              { department: searchRegex },
            ],
          })
            .select('-password')
            .limit(limit)
            .lean()
            .then((users) => {
              results.users = users.map((u) => ({
                id: String(u._id),
                type: 'user',
                title: u.name || u.email,
                subtitle: u.email || '',
                status: u.status || '',
                metadata: {
                  role: u.role,
                  department: u.department,
                },
              }));
            })
        );
      }

      if (want('vendors')) {
        const vendorBase = {
          $or: [
            { vendorName: searchRegex },
            { name: searchRegex },
            { vendorCode: searchRegex },
            { code: searchRegex },
            { 'contact.email': searchRegex },
            { 'contact.phone': searchRegex },
          ],
        };
        const vendorFilter =
          d === 'vendor' && vendorHubKey
            ? mergeHubFilterForKey(vendorBase, vendorHubKey)
            : vendorBase;
        searchPromises.push(
          Vendor.find(vendorFilter)
            .limit(limit)
            .lean()
            .then((vendors) => {
              results.vendors = vendors.map((vendor) => {
                const id = vendor.vendorCode || vendor.code || String(vendor._id);
                return {
                  id,
                  type: 'vendor',
                  title: vendor.vendorName || vendor.name || 'Vendor',
                  subtitle: vendor.vendorCode || vendor.code || '',
                  status: vendor.status,
                  metadata: {
                    contact: vendor.contact?.email || vendor.contact?.phone || '',
                    stage: vendor.stage,
                    vendorTab: 'vendor-list',
                    href: `/vendor/vendor-list?highlight=${encodeURIComponent(id)}`,
                  },
                };
              });
            })
        );
      }

      if (want('riders') && d !== 'vendor') {
        searchPromises.push(
          Rider.find({
            $or: [
              { name: searchRegex },
              { id: searchRegex },
              { zone: searchRegex },
              { currentOrderId: searchRegex },
            ],
          })
            .limit(limit)
            .lean()
            .then((riders) => {
              results.riders = riders.map((rider) => ({
                id: rider.id || String(rider._id),
                type: 'rider',
                title: rider.name,
                subtitle: rider.zone || rider.id || '',
                status: rider.status,
                metadata: {
                  zone: rider.zone,
                  currentOrderId: rider.currentOrderId,
                },
              }));
            })
        );
      }

      if (want('inventory') && d !== 'vendor') {
        searchPromises.push(
          InventoryItem.find({
            $or: [
              { sku: searchRegex },
              { productName: searchRegex },
              { location: searchRegex },
              { id: searchRegex },
              { category: searchRegex },
            ],
          })
            .limit(limit)
            .lean()
            .then((rows) => {
              results.inventory = rows.map((row) => ({
                id: row.id || row.sku,
                type: 'inventory',
                title: row.productName || row.sku,
                subtitle: `${row.sku || ''} · ${row.location || ''}`.trim(),
                status: row.currentStock != null ? String(row.currentStock) : '',
                metadata: {
                  sku: row.sku,
                  location: row.location,
                  currentStock: row.currentStock,
                  lastUpdated: row.lastUpdated,
                },
              }));
            })
        );
      }

      if (d === 'vendor') {
        const poBase = {
          archived: { $ne: true },
          $or: [
            { reference: searchRegex },
            { externalReference: searchRegex },
            { vendorId: searchRegex },
            { 'items.sku': searchRegex },
            { 'items.description': searchRegex },
          ],
        };
        const poFilter = vendorHubKey ? mergeHubFilterForKey(poBase, vendorHubKey) : poBase;
        searchPromises.push(
          PurchaseOrder.find(poFilter)
            .limit(limit)
            .lean()
            .then((pos) => {
              results.orders = pos.map((po) => {
                const id = String(po._id);
                const label =
                  po.reference || po.externalReference || (id ? `PO-${id.slice(-8)}` : 'PO');
                return {
                  id,
                  type: 'purchase_order',
                  title: label,
                  subtitle: po.vendorId ? `Vendor ${po.vendorId}` : '',
                  status: po.status || '',
                  metadata: {
                    vendorTab: 'po',
                    vendorId: po.vendorId,
                    href: `/vendor/po?highlight=${encodeURIComponent(id)}`,
                  },
                };
              });
            })
        );
      }

      await Promise.all(searchPromises);

      const total =
        results.orders.length +
        results.products.length +
        results.users.length +
        results.vendors.length +
        results.riders.length +
        results.inventory.length;

      const took = Date.now() - startTime;

      if (userId && total > 0) {
        await this.saveRecentSearch(userId, query, total, d);
      }

      return {
        query,
        results,
        total,
        took,
      };
    } catch (error) {
      logger.error('Error in global search:', error);
      throw error;
    }
  }

  /**
   * Prefix suggestions from live collections; scope by dashboard.
   */
  async getSuggestions(query, limit = 5, dashboard = '', user = null) {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const searchTerm = query.trim();
    const prefix = new RegExp(`^${escapeRegex(searchTerm)}`, 'i');
    const d = normalizeDashboard(dashboard);
    const cap = Math.max(1, Math.min(20, limit));
    const storeScope = d === 'warehouse' ? warehouseStoreScope(user) : null;
    const warehouseKey = d === 'warehouse' ? user?.warehouseKey : null;
    const vendorHubKey = d === 'vendor' ? resolveHubKeyFromUserDoc(user) : null;
    const financeHubKey = d === 'finance' ? resolveHubKeyFromUserDoc(user) : null;

    try {
      const suggestions = [];

      if (d === 'finance') {
        const payments = await CustomerPayment.find({
          $or: [{ orderId: prefix }, { gatewayRef: prefix }, { customerEmail: prefix }],
        })
          .limit(cap)
          .select('orderId gatewayRef customerEmail')
          .lean();
        payments.forEach((p) => {
          suggestions.push({
            text: p.orderId || p.gatewayRef || p.customerEmail,
            type: 'customer_payment',
            category: 'Customer Payments',
          });
        });

        const invBase = {
          $or: [{ invoiceNumber: prefix }, { vendorName: prefix }, { vendorId: prefix }],
        };
        const invFilter = financeHubKey ? mergeHubFilterForKey(invBase, financeHubKey) : invBase;
        const vendorInvoices = await VendorInvoice.find(invFilter)
          .limit(cap)
          .select('invoiceNumber vendorName vendorId')
          .lean();
        vendorInvoices.forEach((row) => {
          suggestions.push({
            text: row.invoiceNumber || row.vendorName || row.vendorId,
            type: 'vendor_invoice',
            category: 'Vendor Invoices',
          });
        });

        const billing = await Invoice.find({
          $or: [{ invoiceNumber: prefix }, { customerName: prefix }, { customerEmail: prefix }],
        })
          .limit(cap)
          .select('invoiceNumber customerName customerEmail')
          .lean();
        billing.forEach((row) => {
          suggestions.push({
            text: row.invoiceNumber || row.customerName || row.customerEmail,
            type: 'billing_invoice',
            category: 'Billing Invoices',
          });
        });

        return suggestions.slice(0, cap * 2);
      }

      if (d !== 'vendor') {
        let orderQuery = { order_id: prefix };
        if (storeScope) {
          orderQuery = { $and: [storeScope, orderQuery] };
        }
        const orders = await Order.find(orderQuery)
          .limit(cap)
          .select('order_id customer_name')
          .lean();

        orders.forEach((order) => {
          suggestions.push({
            text: order.order_id,
            type: 'order',
            category: 'Orders',
          });
        });

        const products = await SKU.find({
          $or: [{ name: prefix }, { code: prefix }],
        })
          .limit(cap)
          .select('name code')
          .lean();

        products.forEach((product) => {
          suggestions.push({
            text: product.name || product.code,
            type: 'product',
            category: 'Products',
          });
        });
      }

      if (d !== 'warehouse') {
        const vendorBase = {
          $or: [
            { vendorName: prefix },
            { name: prefix },
            { vendorCode: prefix },
            { code: prefix },
          ],
        };
        const vendorFilter =
          d === 'vendor' && vendorHubKey
            ? mergeHubFilterForKey(vendorBase, vendorHubKey)
            : vendorBase;
        const vendors = await Vendor.find(vendorFilter)
          .limit(cap)
          .select('vendorName name vendorCode code')
          .lean();

        vendors.forEach((v) => {
          suggestions.push({
            text: v.vendorCode || v.code || v.vendorName || v.name,
            type: 'vendor',
            category: 'Vendors',
          });
        });

        if (d === 'vendor') {
          const poBase = {
            archived: { $ne: true },
            $or: [
              { reference: prefix },
              { externalReference: prefix },
              { vendorId: prefix },
              { 'items.sku': prefix },
            ],
          };
          const poFilter = vendorHubKey ? mergeHubFilterForKey(poBase, vendorHubKey) : poBase;
          const pos = await PurchaseOrder.find(poFilter)
            .limit(cap)
            .select('reference externalReference vendorId')
            .lean();
          pos.forEach((po) => {
            const label =
              po.reference || po.externalReference || (po.vendorId ? String(po.vendorId) : 'PO');
            suggestions.push({
              text: label,
              type: 'purchase_order',
              category: 'Purchase Orders',
            });
          });
        }

        if (d !== 'vendor') {
          const riders = await Rider.find({
            $or: [{ name: prefix }, { id: prefix }],
          })
            .limit(cap)
            .select('name id')
            .lean();

          riders.forEach((r) => {
            suggestions.push({
              text: r.id || r.name,
              type: 'rider',
              category: 'Riders',
            });
          });

          const users = await AdminUser.find({
            $or: [{ name: prefix }, { email: prefix }],
          })
            .select('name email')
            .limit(cap)
            .lean();

          users.forEach((u) => {
            suggestions.push({
              text: u.email || u.name,
              type: 'user',
              category: 'Users',
            });
          });
        }
      }

      if (d === 'warehouse' || d === 'admin' || d === '') {
        let invQuery = {
          $or: [{ sku: prefix }, { productName: prefix }, { id: prefix }],
        };

        if (d === 'warehouse' && warehouseKey) {
          invQuery = mergeWarehouseFilter(invQuery, warehouseKey);
        }

        const inv = await InventoryItem.find(invQuery)
          .limit(cap)
          .select('sku productName id')
          .lean();

        inv.forEach((row) => {
          suggestions.push({
            text: row.sku || row.productName || row.id,
            type: 'inventory',
            category: 'Inventory',
          });
        });
      }

      return suggestions.slice(0, cap * 2);
    } catch (error) {
      logger.error('Error getting suggestions:', error);
      return [];
    }
  }

  async saveRecentSearch(userId, query, resultCount, dashboard = '') {
    try {
      const uid = userId != null ? String(userId) : '';
      if (!uid) return;
      const d = normalizeDashboard(dashboard);
      const dashKey = FINANCE_DASHBOARD_KEYS.has(d) ? d : '';
      await RecentSearch.findOneAndUpdate(
        { userId: uid, dashboard: dashKey, query: query.trim() },
        { $set: { resultCount, updatedAt: new Date() } },
        { upsert: true }
      );
    } catch (error) {
      logger.error('Error saving recent search:', error);
    }
  }

  async getRecentSearches(userId, limit = 10, dashboard = '') {
    try {
      const uid = userId != null ? String(userId) : '';
      if (!uid) return [];
      const d = normalizeDashboard(dashboard);
      const dashKey = FINANCE_DASHBOARD_KEYS.has(d) ? d : '';

      const rows = await RecentSearch.find({ userId: uid, dashboard: dashKey })
        .sort({ updatedAt: -1 })
        .limit(Math.max(1, Math.min(50, limit)))
        .select('query')
        .lean();

      return rows.map((r) => r.query).filter(Boolean);
    } catch (error) {
      logger.error('Error getting recent searches:', error);
      return [];
    }
  }
}

module.exports = new GlobalSearchService();
