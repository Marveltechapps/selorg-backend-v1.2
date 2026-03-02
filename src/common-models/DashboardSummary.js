// This is a virtual model for DashboardSummary
// It doesn't have a database collection but represents the aggregated data structure

const DashboardSummarySchema = {
  activeRiders: {
    type: Number,
    required: true,
    min: 0,
  },
  maxRiders: {
    type: Number,
    required: true,
    min: 0,
  },
  activeRiderUtilizationPercent: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  ordersInTransit: {
    type: Number,
    required: true,
    min: 0,
  },
  ordersInTransitChangePercent: {
    type: Number,
    required: true,
  },
  avgDeliveryTimeSeconds: {
    type: Number,
    required: true,
    min: 0,
  },
  avgDeliveryTimeWithinSla: {
    type: Boolean,
    required: true,
  },
  slaBreaches: {
    type: Number,
    required: true,
    min: 0,
  },
};

module.exports = DashboardSummarySchema;

