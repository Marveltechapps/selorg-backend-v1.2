const { z } = require('zod');

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
});

const getCurrentUserSchema = z.object({
  params: z.object({}),
});

module.exports = {
  loginSchema,
  getCurrentUserSchema,
};

