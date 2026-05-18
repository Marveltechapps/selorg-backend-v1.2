'use strict';

const { z } = require('zod');
const { locationZ, itemZ } = require('./order.zod');

const estimateBody = z.object({
  pickup: locationZ,
  drop: locationZ,
  items: z.array(itemZ).min(1),
  vehicleType: z.string().optional(),
  providers: z.array(z.enum(['PORTER', 'SHADOWFAX', 'LOADSHARE'])).optional(),
});

module.exports = { estimateBody };
