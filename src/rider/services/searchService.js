const riderService = require('../rider/riderService');
const orderService = require('../order/orderService');
const logger = require('../../core/utils/logger');

const unifiedSearch = async (query, type = 'all', limit = 10) => {
  const results = {
    riders: [],
    orders: [],
    customers: [],
    total: 0,
  };

  try {
    // Search riders
    if (type === 'all' || type === 'riders') {
      results.riders = await riderService.searchRiders(query, limit);
    }

    // Search orders (by id, customerName, or items based on type)
    if (type === 'all' || type === 'orders') {
      results.orders = await orderService.searchOrders(query, limit, false);
    }

    // Search products (search in order items)
    if (type === 'product' || type === 'products') {
      results.orders = await orderService.searchOrders(query, limit, true);
    }

    // Search customers (search by customer name in orders)
    if (type === 'customer' || type === 'customers') {
      const ordersByCustomer = await orderService.searchOrders(query, limit, false);
      results.orders = ordersByCustomer;
    }

    // Extract unique customers from orders (for all types that return orders)
    if (results.orders.length > 0) {
      const customerMap = new Map();
      results.orders.forEach((order) => {
        if (order.customerName) {
          if (!customerMap.has(order.customerName)) {
            customerMap.set(order.customerName, {
              name: order.customerName,
              orderCount: 1,
              latestOrderId: order.id,
            });
          } else {
            const customer = customerMap.get(order.customerName);
            customer.orderCount += 1;
          }
        }
      });
      results.customers = Array.from(customerMap.values());
    }

    results.total = results.riders.length + results.orders.length + results.customers.length;

    return results;
  } catch (error) {
    logger.error('Error in unified search:', error);
    throw error;
  }
};

module.exports = {
  unifiedSearch,
};

