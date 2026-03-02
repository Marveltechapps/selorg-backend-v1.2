const { z } = require('zod');

const createTicketSchema = z.object({
  body: z.object({
    subject: z.string().min(1, 'Subject is required'),
    description: z.string().min(1, 'Description is required'),
    category: z.enum(['order', 'payment', 'delivery', 'account', 'technical', 'feedback']),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    customerId: z.string().min(1, 'Customer ID is required'),
    customerName: z.string().min(1, 'Customer name is required'),
    customerEmail: z.string().email('Invalid email format'),
    customerPhone: z.string().optional(),
    orderNumber: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

const updateTicketSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1, 'Ticket ID is required'),
  }),
  body: z.object({
    status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    assignedTo: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

const assignTicketSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1, 'Ticket ID is required'),
  }),
  body: z.object({
    agentId: z.string().min(1, 'Agent ID is required'),
  }),
});

const addTicketNoteSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1, 'Ticket ID is required'),
  }),
  body: z.object({
    note: z.string().min(1, 'Note content is required'),
    isInternal: z.boolean().optional(),
  }),
});

module.exports = {
  createTicketSchema,
  updateTicketSchema,
  assignTicketSchema,
  addTicketNoteSchema,
};

