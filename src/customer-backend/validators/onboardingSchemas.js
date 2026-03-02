const { z } = require('zod');
const onboardingPageSchema = z.object({
  pageNumber: z.number(),
  title: z.string(),
  description: z.string(),
  imageUrl: z.string(),
  ctaText: z.string().optional(),
  isActive: z.boolean().optional(),
  order: z.number().optional(),
  _id: z.unknown().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});
const onboardingStatusSchema = z.object({
  onboardingCompleted: z.boolean(),
  onboardingCompletedAt: z.string().nullable(),
});
module.exports = { onboardingPageSchema, onboardingStatusSchema };
