const mongoose = require('mongoose');
const Alert = require('../models/Alert');
const Campaign = require('../models/Campaign');
const SkuAllocationService = require('./skuAllocationService');

async function findCampaignByRef(ref) {
  if (!ref) return null;
  if (ref.id && mongoose.Types.ObjectId.isValid(String(ref.id))) {
    return Campaign.findById(ref.id);
  }
  if (ref.name) {
    return Campaign.findOne({ name: ref.name });
  }
  return null;
}

async function resolvePricingConflict(alertId, body) {
  const alert = await Alert.findById(alertId);
  if (!alert) throw new Error('Alert not found');

  const campaigns = alert.linkedEntities?.campaigns || [];
  const { resolutionType, marginCap } = body || {};

  if (resolutionType === 'keep_a' && campaigns[0]) {
    const disable = campaigns[1];
    if (disable) {
      const toPause = await findCampaignByRef(disable);
      if (toPause) {
        toPause.status = 'Paused';
        await toPause.save();
      }
    }
  } else if (resolutionType === 'keep_b' && campaigns[1]) {
    const disable = campaigns[0];
    if (disable) {
      const toPause = await findCampaignByRef(disable);
      if (toPause) {
        toPause.status = 'Paused';
        await toPause.save();
      }
    }
  } else if (resolutionType === 'adjust' && campaigns.length >= 2) {
    for (const ref of campaigns) {
      const c = await findCampaignByRef(ref);
      if (c) {
        c.rules = c.rules || {};
        c.rules.discountLogic = `Capped at ${marginCap ?? 30}% combined`;
        await c.save();
      }
    }
  }

  alert.status = 'Resolved';
  alert.resolutionNote = `Pricing conflict resolved (${resolutionType || 'adjust'})`;
  await alert.save();
  return alert;
}

async function allocateStockForAlert(alertId, body, userId) {
  const alert = await Alert.findById(alertId);
  if (!alert) throw new Error('Alert not found');

  const skuName = alert.linkedEntities?.skus?.[0];
  const dest = alert.linkedEntities?.store || body.toLocation;
  const { source = 'Central Warehouse', quantity } = body;

  if (!dest || !quantity) {
    throw new Error('Destination and quantity are required');
  }

  const transferOrder = await SkuAllocationService.createTransferFromAllocation(
    {
      skuId: skuName,
      fromLocation: source,
      toLocation: dest,
      quantity: Number(quantity),
    },
    userId || undefined,
  );

  alert.status = 'Resolved';
  alert.resolutionNote = `Stock transfer ${transferOrder?.referenceNumber || transferOrder?.transferId || 'created'}`;
  await alert.save();

  return { alert, transferOrder };
}

async function pauseCampaignForAlert(alertId, body) {
  const alert = await Alert.findById(alertId);
  if (!alert) throw new Error('Alert not found');

  const ref = alert.linkedEntities?.campaigns?.[0];
  const campaign = await findCampaignByRef(ref);
  if (campaign) {
    campaign.status = 'Paused';
    await campaign.save();
  }

  alert.status = 'Resolved';
  alert.resolutionNote = body?.reason ? `Campaign paused: ${body.reason}` : 'Campaign paused';
  await alert.save();
  return { alert, campaign };
}

async function clearResolvedAlerts() {
  const result = await Alert.deleteMany({
    status: { $in: ['Resolved', 'Dismissed'] },
  });
  return result.deletedCount || 0;
}

module.exports = {
  resolvePricingConflict,
  allocateStockForAlert,
  pauseCampaignForAlert,
  clearResolvedAlerts,
};
