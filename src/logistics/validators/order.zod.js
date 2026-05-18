'use strict';

const { z } = require('zod');

const locationZ = z.object({
  name: z.string().min(1),
  phone: z.string().min(5),
  address: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
});

const itemZ = z.object({
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  weight: z.number().nonnegative().optional(),
});

const createOrderBody = z.object({
  referenceId: z.string().min(1),
  type: z.enum(['VENDOR_TO_WAREHOUSE', 'WAREHOUSE_TO_DARKSTORE']),
  provider: z.enum(['PORTER', 'SHADOWFAX', 'LOADSHARE']).default('PORTER'),
  pickup: locationZ,
  drop: locationZ,
  items: z.array(itemZ).min(1),
  vehicleType: z.string().optional(),
  scheduledTime: z.coerce.date().optional(),
});

const listOrdersQuery = z.object({
  status: z.string().optional(),
  provider: z.string().optional(),
  type: z.enum(['VENDOR_TO_WAREHOUSE', 'WAREHOUSE_TO_DARKSTORE']).optional(),
  referenceId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = { createOrderBody, listOrdersQuery, locationZ, itemZ };
