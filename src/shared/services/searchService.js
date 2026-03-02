const Order = require('../../darkstore/models/Order');
const SKU = require('../../merch/models/SKU');
// const User = require('../../admin/models/User'); // User model may not exist, commenting out for now
const Vendor = require('../../vendor/models/Vendor');
const Rider = require('../../rider/models/Rider');
// const Inventory = require('../../darkstore/models/Inventory');
const logger = require('../../core/utils/logger'); // Inventory model may not exist, commenting out for now

/**
 * Global Search Service
 * Searches across all modules and returns unified results
 */
class GlobalSearchService {
  /**
   * Perform global search across all modules
   * @param {string} query - Search query
   * @param {string} type - Type filter (all, orders, products, users, vendors, riders, inventory)
   * @param {number} limit - Results limit per module
   * @param {string} userId - User ID for recent searches tracking
   */
  async globalSearch(query, type = 'all', limit = 10, userId = null) {
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
    const searchRegex = new RegExp(searchTerm, 'i');

    const results = {
      orders: [],
      products: [],
      users: [],
      vendors: [],
      riders: [],
      inventory: [],
    };

    try {
      // Parallel search across all modules
      const searchPromises = [];

      // Search Orders
      if (type === 'all' || type === 'orders') {
        searchPromises.push(
          Order.find({
            $or: [
              { order_id: searchRegex },
              { customer_name: searchRegex },
              { customer_phone: searchRegex },
              { 'items.sku': searchRegex },
              { 'items.name': searchRegex },
            ],
          })
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
                  amount: order.total_amount,
                  items: order.items?.length || 0,
                  created_at: order.created_at,
                },
              }));
            })
        );
      }

      // Search Products
      if (type === 'all' || type === 'products') {
        searchPromises.push(
          SKU.find({
            $or: [
              { name: searchRegex },
              { sku: searchRegex },
              { barcode: searchRegex },
              { description: searchRegex },
            ],
          })
            .limit(limit)
            .lean()
            .then((products) => {
              results.products = products.map((product) => ({
                id: product.sku || product.id,
                type: 'product',
                title: product.name,
                subtitle: product.sku || 'No SKU',
                status: product.status,
                metadata: {
                  price: product.price,
                  stock: product.stock,
                  category: product.category,
                },
              }));
            })
        );
      }

      // Search Users
      if (type === 'all' || type === 'users') {
        searchPromises.push(
          Promise.resolve([]).then((users) => {
            results.users = [];
          })
        );
      }

      // Search Vendors
      if (type === 'all' || type === 'vendors') {
        searchPromises.push(
          Vendor.find({
            $or: [
              { name: searchRegex },
              { vendor_code: searchRegex },
              { contact_email: searchRegex },
              { contact_phone: searchRegex },
            ],
          })
            .limit(limit)
            .lean()
            .then((vendors) => {
              results.vendors = vendors.map((vendor) => ({
                id: vendor.vendor_code || vendor.id,
                type: 'vendor',
                title: vendor.name,
                subtitle: vendor.vendor_code || 'No Code',
                status: vendor.status,
                metadata: {
                  contact: vendor.contact_email || vendor.contact_phone,
                  rating: vendor.rating,
                },
              }));
            })
        );
      }

      // Search Riders
      if (type === 'all' || type === 'riders') {
        searchPromises.push(
          Rider.find({
            $or: [
              { name: searchRegex },
              { rider_id: searchRegex },
              { phone: searchRegex },
              { vehicle_number: searchRegex },
            ],
          })
            .limit(limit)
            .lean()
            .then((riders) => {
              results.riders = riders.map((rider) => ({
                id: rider.rider_id || rider.id,
                type: 'rider',
                title: rider.name,
                subtitle: rider.rider_id || 'No ID',
                status: rider.status,
                metadata: {
                  phone: rider.phone,
                  vehicle: rider.vehicle_number,
                },
              }));
            })
        );
      }

      // Search Inventory
      if (type === 'all' || type === 'inventory') {
        searchPromises.push(
          Promise.resolve([]).then((inventory) => {
            results.inventory = [];
          })
        );
      }

      await Promise.all(searchPromises);

      // Calculate total
      const total =
        results.orders.length +
        results.products.length +
        results.users.length +
        results.vendors.length +
        results.riders.length +
        results.inventory.length;

      const took = Date.now() - startTime;

      // Save recent search (if userId provided)
      if (userId && total > 0) {
        this.saveRecentSearch(userId, query, total);
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
   * Get search suggestions based on query
   */
  async getSuggestions(query, limit = 5) {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const searchTerm = query.trim();
    const searchRegex = new RegExp(`^${searchTerm}`, 'i');

    try {
      const suggestions = [];

      // Get suggestions from orders
      const orders = await Order.find({ order_id: searchRegex })
        .limit(limit)
        .select('order_id customer_name')
        .lean();

      orders.forEach((order) => {
        suggestions.push({
          text: order.order_id,
          type: 'order',
          category: 'Orders',
        });
      });

      // Get suggestions from products
      const products = await SKU.find({ name: searchRegex })
        .limit(limit)
        .select('name sku')
        .lean();

      products.forEach((product) => {
        suggestions.push({
          text: product.name,
          type: 'product',
          category: 'Products',
        });
      });

      return suggestions.slice(0, limit * 2);
    } catch (error) {
      logger.error('Error getting suggestions:', error);
      return [];
    }
  }

  /**
   * Save recent search
   */
  async saveRecentSearch(userId, query, resultCount) {
    try {
      // In a real implementation, save to RecentSearch collection
      // For now, we'll just log it
      logger.info(`Recent search saved: User ${userId} searched "${query}" (${resultCount} results)`);
    } catch (error) {
      logger.error('Error saving recent search:', error);
    }
  }

  /**
   * Get recent searches for a user
   */
  async getRecentSearches(userId, limit = 10) {
    try {
      // In a real implementation, fetch from RecentSearch collection
      // For now, return empty array
      return [];
    } catch (error) {
      logger.error('Error getting recent searches:', error);
      return [];
    }
  }
}

module.exports = new GlobalSearchService();
