/**
 * Admin Support Center controller – tickets, FAQ, feedback.
 */
const adminSupportService = require('../services/adminSupportService');
const { asyncHandler } = require('../../core/middleware');

const listTickets = asyncHandler(async (req, res) => {
  const filters = {
    status: req.query.status,
    priority: req.query.priority,
    category: req.query.category,
    assignedTo: req.query.assignedTo,
    search: req.query.search,
  };
  const data = await adminSupportService.listTickets(filters);
  res.json({ success: true, data });
});

const getTicket = asyncHandler(async (req, res) => {
  const data = await adminSupportService.getTicketById(req.params.id);
  if (!data) return res.status(404).json({ success: false, error: 'Ticket not found' });
  res.json({ success: true, data });
});

const createTicket = asyncHandler(async (req, res) => {
  const agentId = req.user?.userId || req.user?.id || 'admin-1';
  const agentName = req.user?.name || req.user?.email || 'Admin';
  const data = await adminSupportService.createTicket(req.body, agentId, agentName);
  res.status(201).json({ success: true, data });
});

const updateTicket = asyncHandler(async (req, res) => {
  const data = await adminSupportService.updateTicket(req.params.id, req.body);
  if (!data) return res.status(404).json({ success: false, error: 'Ticket not found' });
  res.json({ success: true, data });
});

const assignTicket = asyncHandler(async (req, res) => {
  const { agentId } = req.body;
  const agentName = req.body.agentName || req.user?.name || 'Admin';
  const data = await adminSupportService.assignTicket(req.params.id, agentId, agentName);
  if (!data) return res.status(404).json({ success: false, error: 'Ticket not found' });
  res.json({ success: true, data });
});

const addNote = asyncHandler(async (req, res) => {
  const noteData = {
    authorId: req.body.authorId || req.user?.id || 'agent-1',
    authorName: req.body.authorName || req.user?.name || 'Current Agent',
    type: req.body.type || 'agent_reply',
    content: req.body.content,
    isInternal: req.body.isInternal || false,
  };
  const data = await adminSupportService.addTicketNote(req.params.id, noteData);
  res.status(201).json({ success: true, data });
});

const closeTicket = asyncHandler(async (req, res) => {
  const data = await adminSupportService.closeTicket(req.params.id);
  if (!data) return res.status(404).json({ success: false, error: 'Ticket not found' });
  res.json({ success: true, data });
});

const listAgents = asyncHandler(async (req, res) => {
  const data = await adminSupportService.listAgents();
  res.json({ success: true, data });
});

const listCategories = asyncHandler(async (req, res) => {
  const data = await adminSupportService.listCategories();
  res.json({ success: true, data });
});

const listCannedResponses = asyncHandler(async (req, res) => {
  const data = await adminSupportService.listCannedResponses();
  res.json({ success: true, data });
});

const getSLAMetrics = asyncHandler(async (req, res) => {
  const data = await adminSupportService.getSLAMetrics();
  res.json({ success: true, data });
});

const listLiveChats = asyncHandler(async (req, res) => {
  const data = await adminSupportService.listLiveChats();
  res.json({ success: true, data });
});

const listFAQs = asyncHandler(async (req, res) => {
  const data = await adminSupportService.listFAQs();
  res.json({ success: true, data });
});

const createFAQ = asyncHandler(async (req, res) => {
  const data = await adminSupportService.createFAQ(req.body);
  res.status(201).json({ success: true, data });
});

const updateFAQ = asyncHandler(async (req, res) => {
  const data = await adminSupportService.updateFAQ(req.params.id, req.body);
  if (!data) return res.status(404).json({ success: false, error: 'FAQ not found' });
  res.json({ success: true, data });
});

const deleteFAQ = asyncHandler(async (req, res) => {
  await adminSupportService.deleteFAQ(req.params.id);
  res.json({ success: true });
});

const listFeedback = asyncHandler(async (req, res) => {
  const data = await adminSupportService.listFeedback();
  res.json({ success: true, data });
});

module.exports = {
  listTickets,
  getTicket,
  createTicket,
  updateTicket,
  assignTicket,
  addNote,
  closeTicket,
  listAgents,
  listCategories,
  listCannedResponses,
  getSLAMetrics,
  listLiveChats,
  listFAQs,
  createFAQ,
  updateFAQ,
  deleteFAQ,
  listFeedback,
};
