const { z } = require('zod');

const ticketCategoryEnum = z.enum([
  'order',
  'payment',
  'delivery',
  'account',
  'technical',
  'feedback',
]);

/** Customer app ticket create (fields may come from multipart form strings). */
const customerCreateTicketSchema = z.object({
  body: z.object({
    subject: z.string().max(200).optional(),
    description: z.string().max(5000).optional(),
    message: z.string().max(5000).optional(),
    category: ticketCategoryEnum.optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    orderNumber: z.string().max(80).optional(),
    orderId: z.string().max(80).optional(),
    channel: z.string().max(40).optional(),
    liveChat: z.union([z.boolean(), z.string()]).optional(),
    type: z.string().max(40).optional(),
  }),
});

const customerSendMessageSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1, 'Ticket ID is required'),
  }),
  body: z.object({
    message: z.string().max(5000).optional(),
    text: z.string().max(5000).optional(),
    content: z.string().max(5000).optional(),
  }),
});

const faqFeedbackSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'FAQ ID is required'),
  }),
  body: z.object({
    helpful: z.boolean(),
  }),
});

const createTicketSchema = z.object({
  body: z.object({
    subject: z.string().min(1, 'Subject is required'),
    description: z.string().min(1, 'Description is required'),
    category: ticketCategoryEnum,
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
  customerCreateTicketSchema,
  customerSendMessageSchema,
  faqFeedbackSchema,
};
