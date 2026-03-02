const { z } = require('zod');

const createUserSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    name: z.string().min(2, 'Name must be at least 2 characters'),
    roleId: z.string().min(1, 'Role ID is required'),
    department: z.string().optional(),
    twoFactorEnabled: z.boolean().optional(),
    reportingManagerId: z.string().optional(),
    location: z.array(z.string()).optional(),
    startDate: z.string().optional(),
    notes: z.string().optional(),
  }),
});

const updateUserSchema = z.object({
  params: z.object({
    userId: z.string().min(1, 'User ID is required'),
  }),
  body: z.object({
    name: z.string().min(2).optional(),
    status: z.enum(['active', 'inactive', 'suspended']).optional(),
    roleId: z.string().optional(),
    department: z.string().optional(),
    location: z.array(z.string()).optional(),
    notes: z.string().optional(),
  }),
});

const getUserSchema = z.object({
  params: z.object({
    userId: z.string().min(1, 'User ID is required'),
  }),
});

const getUsersSchema = z.object({
  query: z.object({
    status: z.enum(['active', 'inactive', 'suspended']).optional(),
    roleId: z.string().optional(),
    search: z.string().optional(),
  }),
});

module.exports = {
  createUserSchema,
  updateUserSchema,
  getUserSchema,
  getUsersSchema,
};

