'use strict';

const { z } = require('zod');

const patchProviderParams = z.object({
  id: z.string().min(1),
});

const patchProviderBody = z
  .object({
    isActive: z.boolean().optional(),
    priority: z.number().int().min(0).max(9999).optional(),
  })
  .refine((d) => d.isActive !== undefined || d.priority !== undefined, {
    message: 'Provide isActive and/or priority',
  });

const reorderProviderBody = z.object({
  direction: z.enum(['up', 'down']),
});

const analyticsCostQuery = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

module.exports = {
  patchProviderParams,
  patchProviderBody,
  reorderProviderBody,
  analyticsCostQuery,
};
