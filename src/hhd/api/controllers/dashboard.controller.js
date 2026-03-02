const { ErrorResponse } = require('../../utils/ErrorResponse');
const HHDUser = require('../../models/User.model');
const HHDOrder = require('../../models/Order.model');
const HHDCompletedOrder = require('../../models/CompletedOrder.model');
const mongoose = require('mongoose');

/**
 * @desc    Get dashboard data for HHD homepage
 * @route   GET /api/users/dashboard
 * @access  Private
 */
async function getDashboard(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new ErrorResponse('User not authenticated', 401);
    }

    // Fetch user profile
    const user = await HHDUser.findById(userId).select('-password').lean();
    if (!user) {
      throw new ErrorResponse('User not found', 404);
    }

    // Treat dashboard fetch as activity: update lastLogin so connectionStatus stays "online"
    await HHDUser.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { lastLogin: new Date() } }
    ).catch(() => {}); // non-blocking

    // Get today's date range (start and end of day)
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // Fetch today's completed orders for this user
    const todayCompletedOrders = await HHDCompletedOrder.find({
      userId: new mongoose.Types.ObjectId(userId),
      completedAt: { $gte: startOfDay, $lte: endOfDay },
    }).lean();

    // Calculate statistics
    const todayCompleted = todayCompletedOrders.length;

    // Calculate average pick time (in seconds)
    let totalPickTimeSeconds = 0;
    let validPickTimeCount = 0;

    todayCompletedOrders.forEach((order) => {
      let pickTimeSeconds = null;

      // Priority 1: Calculate from startedAt and completedAt
      if (order.startedAt && order.completedAt) {
        const startTime = new Date(order.startedAt).getTime();
        const completedTime = new Date(order.completedAt).getTime();
        pickTimeSeconds = Math.round((completedTime - startTime) / 1000);
      }
      // Priority 2: Use pickTime field (in minutes, convert to seconds)
      else if (order.pickTime && order.pickTime > 0) {
        pickTimeSeconds = Math.round(order.pickTime * 60);
      }

      if (pickTimeSeconds !== null && pickTimeSeconds > 0) {
        totalPickTimeSeconds += pickTimeSeconds;
        validPickTimeCount++;
      }
    });

    const averagePickTimeSeconds = validPickTimeCount > 0
      ? Math.round(totalPickTimeSeconds / validPickTimeCount)
      : 0;

    // Calculate SLA compliance (orders completed within target time)
    let slaCompliantOrders = 0;

    todayCompletedOrders.forEach((order) => {
      if (!order.targetTime || !order.startedAt || !order.completedAt) {
        // If no target time or timing data, consider it compliant
        slaCompliantOrders++;
        return;
      }

      let pickTimeSeconds = null;
      if (order.startedAt && order.completedAt) {
        const startTime = new Date(order.startedAt).getTime();
        const completedTime = new Date(order.completedAt).getTime();
        pickTimeSeconds = Math.round((completedTime - startTime) / 1000);
      } else if (order.pickTime && order.pickTime > 0) {
        pickTimeSeconds = Math.round(order.pickTime * 60);
      }

      if (pickTimeSeconds === null) {
        slaCompliantOrders++;
        return;
      }

      // targetTime is in minutes, convert to seconds
      const targetTimeSeconds = order.targetTime * 60;
      if (pickTimeSeconds <= targetTimeSeconds) {
        slaCompliantOrders++;
      }
    });

    const slaCompliance = todayCompleted > 0
      ? Math.round((slaCompliantOrders / todayCompleted) * 100)
      : 100;

    // Calculate accuracy (assuming 100% for now - can be enhanced with scanned items data)
    const accuracyPercent = 100;

    // Check user's current status
    const activeOrder = await HHDOrder.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      status: { $in: ['assigned', 'picking'] },
    }).lean();

    let status = 'waiting'; // waiting | assigned | picking | offline
    if (activeOrder) {
      status = activeOrder.status === 'picking' ? 'picking' : 'assigned';
    }

    // User just successfully requested dashboard → they are online
    const connectionStatus = 'online';

    // Goals - these could come from a separate Goals collection in the future
    // For now, using default values
    const dailyTarget = 50; // Could be stored in user profile or goals collection
    const shiftTarget = 25; // Could be calculated based on shift duration

    // Shift information - placeholder for now
    // In production, this would come from a Shifts collection or scheduling system
    const currentHour = now.getHours();
    const shift = {
      startTime: '09:00',
      endTime: '17:00',
      hoursWorked: Math.max(0, Math.min(8, currentHour - 9)),
      remainingTime: Math.max(0, 17 - currentHour),
      breakScheduled: '12:00-12:30',
    };

    // Notifications - placeholder for now
    // In production, this would come from a Notifications collection
    const notifications = [];

    // Construct response
    const dashboardData = {
      user: {
        name: user.name || 'User',
        deviceId: user.deviceId || 'N/A',
        role: user.role,
      },
      goals: {
        dailyTarget,
        shiftTarget,
        type: 'orders',
      },
      statistics: {
        todayCompleted,
        accuracyPercent,
        averagePickTimeSeconds,
        slaCompliance,
      },
      status: {
        current: status,
        assignmentMode: 'auto', // Could be stored in user preferences
        connectionStatus,
        nextOrderETA: null, // Could be calculated based on order queue
        queuePosition: null, // If manual assignment
      },
      shift,
      notifications,
    };

    res.status(200).json({
      success: true,
      data: dashboardData,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getDashboard };
