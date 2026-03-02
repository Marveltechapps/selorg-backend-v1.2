const InterWarehouseTransfer = require('../models/InterWarehouseTransfer');
const ErrorResponse = require("../../core/utils/ErrorResponse");

/**
 * @desc Inter-Warehouse Transfer Service
 */
const interWarehouseService = {
  listTransfers: async () => {
    const transfers = await InterWarehouseTransfer.find().sort({ createdAt: -1 }).lean();
    // Transform to match frontend WarehouseTransfer interface
    return transfers.map(t => ({
      id: t.id,
      transferId: t.id,
      destination: t.destination,
      status: t.status === 'loading' ? 'loading' : t.status === 'en-route' ? 'en-route' : t.status === 'completed' ? 'completed' : 'pending',
      distance: t.distance,
      eta: t.eta,
      progress: t.progress || 0,
      items: t.items
    }));
  },

  requestTransfer: async (data) => {
    if (!data.id) {
      const count = await InterWarehouseTransfer.countDocuments();
      data.id = `TRF-${(count + 1).toString().padStart(3, '0')}`;
    }
    return await InterWarehouseTransfer.create(data);
  },

  getTransferById: async (id) => {
    const transfer = await InterWarehouseTransfer.findOne({ id });
    if (!transfer) throw new ErrorResponse(`Transfer not found with id ${id}`, 404);
    return transfer;
  },

  updateStatus: async (id, updateData) => {
    const transfer = await InterWarehouseTransfer.findOne({ id });
    if (!transfer) throw new ErrorResponse(`Transfer not found with id ${id}`, 404);
    
    Object.assign(transfer, updateData);
    await transfer.save();
    return transfer;
  },

  getTracking: async (id) => {
    const transfer = await InterWarehouseTransfer.findOne({ id });
    if (!transfer) throw new ErrorResponse(`Transfer not found with id ${id}`, 404);
    
    // Simulate real-time tracking based on progress
    const progress = transfer.progress || 0;
    const origin = { lat: 12.9716, lng: 77.5946 }; // Example: Bangalore
    const dest = { lat: 13.0827, lng: 80.2707 };   // Example: Chennai
    
    const currentLat = origin.lat + (dest.lat - origin.lat) * (progress / 100);
    const currentLng = origin.lng + (dest.lng - origin.lng) * (progress / 100);

    return {
      id: transfer.id,
      status: transfer.status,
      currentLocation: transfer.status === 'en-route' ? `GPS: ${currentLat.toFixed(4)}, ${currentLng.toFixed(4)}` : transfer.destination,
      eta: transfer.status === 'en-route' ? `${Math.round(45 * (1 - progress / 100))} mins` : 'N/A',
      progress: progress,
      route: [
        { lat: origin.lat, lng: origin.lng, status: 'passed' },
        { lat: currentLat, lng: currentLng, status: 'current' },
        { lat: dest.lat, lng: dest.lng, status: 'pending' }
      ]
    };
  }
};

module.exports = interWarehouseService;

