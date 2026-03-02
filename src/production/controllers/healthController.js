const Checklist = require('../models/Checklist');
const ChecklistItem = require('../models/ChecklistItem');
const Device = require('../models/Device');
const NetworkStatus = require('../models/NetworkStatus');
const PowerBackup = require('../models/PowerBackup');
const Incident = require('../models/Incident');
const AuditLog = require('../models/AuditLog');
const logger = require('../../core/utils/logger');

const getHealthSummary = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;

    const networkStatus = await NetworkStatus.findOne({ store_id: storeId }).sort({ createdAt: -1 });
    const openIssues = await Incident.countDocuments({ store_id: storeId, status: 'open' });

    // Check today's checklists status
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0];
    const checklists = await Checklist.find({ 
      store_id: storeId, 
      date: { $gte: new Date(dateStr), $lt: new Date(dateStr + 'T23:59:59.999Z') } 
    });

    let readinessStatus = 'In Progress';
    if (checklists.length > 0) {
      const allCompleted = checklists.every(c => c.status === 'completed');
      if (allCompleted) {
        readinessStatus = 'Ready';
      } else {
        const someCompleted = checklists.some(c => c.status === 'completed');
        readinessStatus = someCompleted ? 'Partially Ready' : 'In Progress';
      }
    } else {
      readinessStatus = 'Not Started';
    }

    res.json({
      success: true,
      summary: {
        network_status: networkStatus?.status || 'Stable',
        open_issues_count: openIssues,
        readiness_status: readinessStatus
      },
      date: new Date().toISOString().split('T')[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch store health summary',
    });
  }
};

const getChecklists = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const checklistType = req.query.checklistType || 'all';
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const dateStr = date.toISOString().split('T')[0];

    const query = { store_id: storeId, date: { $gte: new Date(dateStr), $lt: new Date(dateStr + 'T23:59:59.999Z') } };
    if (checklistType !== 'all') {
      query.checklist_type = checklistType;
    }

    let checklists = await Checklist.find(query).lean();

    // If no checklists found for today and it's today's date, auto-create them from template
    if (checklists.length === 0 && !req.query.date) {
      logger.info(`No checklists found for today (${dateStr}), auto-creating...`);
      const checklistTypes = ['opening', 'closing', 'hygiene'];
      const tasksByType = {
        opening: [
          'Disable Alarm System & Unlock Entrances',
          'Check all lights and electrical systems',
          'Verify temperature in chillers and freezers',
          'Stock check critical items',
          'Prepare packing stations'
        ],
        closing: [
          'Clean packing stations',
          'Secure high-value inventory',
          'Enable alarm system & Lock Entrances',
          'Dispose of waste',
          'Final temperature check'
        ],
        hygiene: [
          'Sanitize all surfaces',
          'Restock hand sanitizers',
          'Check pest control measures',
          'Clean restrooms',
          'Inspect food contact surfaces'
        ]
      };

      const newChecklists = [];
      for (const type of checklistTypes) {
        const checklist_id = `CHK-${type.toUpperCase()}-${Date.now().toString().slice(-4)}`;
        const tasks = tasksByType[type];
        
        const newChecklist = await Checklist.create({
          checklist_id,
          store_id: storeId,
          checklist_type: type,
          date: new Date(dateStr),
          status: 'in_progress',
          progress: 0,
          total_items: tasks.length,
          completed_items: 0
        });

        const items = tasks.map((task, index) => ({
          item_id: `${checklist_id}-ITEM-${String(index + 1).padStart(3, '0')}`,
          checklist_id: checklist_id,
          task,
          status: 'pending'
        }));

        await ChecklistItem.insertMany(items);
        
        const checklistWithItems = newChecklist.toObject();
        checklistWithItems.items = items;
        newChecklists.push(checklistWithItems);
      }
      
      checklists = newChecklists;
      if (checklistType !== 'all') {
        checklists = checklists.filter(c => c.checklist_type === checklistType);
      }
    } else {
      checklists = await Promise.all(
        checklists.map(async (checklist) => {
          const items = await ChecklistItem.find({ checklist_id: checklist.checklist_id }).lean();
          return {
            ...checklist,
            items: items.map((item) => ({
              item_id: item.item_id,
              task: item.task,
              status: item.status,
              completed_at: item.completed_at,
              completed_by: item.completed_by,
              notes: item.notes,
            })),
          };
        })
      );
    }

    res.json({
      success: true,
      checklists,
    });
  } catch (error) {
    logger.error('getChecklists error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch checklists',
    });
  }
};

const updateChecklistItem = async (req, res) => {
  try {
    const { checklistId, itemId } = req.params;
    const { status, completed_by, notes } = req.body;

    if (!checklistId || !itemId) {
      return res.status(400).json({
        success: false,
        error: 'checklistId and itemId are required',
      });
    }

    const item = await ChecklistItem.findOneAndUpdate(
      { item_id: itemId, checklist_id: checklistId },
      {
        $set: {
          status: status || 'pending',
          completed_by,
          notes,
          completed_at: status === 'checked' ? new Date() : null,
        },
      },
      { new: true }
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        error: `Checklist item not found: checklistId=${checklistId}, itemId=${itemId}`,
      });
    }

    const checklist = await Checklist.findOne({ checklist_id: checklistId });
    if (checklist) {
      const totalItems = await ChecklistItem.countDocuments({ checklist_id: checklistId });
      const completedItems = await ChecklistItem.countDocuments({ checklist_id: checklistId, status: 'checked' });
      checklist.completed_items = completedItems;
      checklist.total_items = totalItems;
      checklist.progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
      await checklist.save();

      // Log action
      await AuditLog.create({
        id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString(),
        action_type: 'update',
        user: completed_by || 'System User',
        module: 'health',
        action: 'UPDATE_CHECKLIST_ITEM',
        details: { checklistId, itemId, status: status || 'pending', task: item.task },
        store_id: checklist.store_id
      });
    }

    res.status(200).json({
      success: true,
      item_id: item.item_id,
      status: item.status,
      message: 'Checklist item updated',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update checklist item',
    });
  }
};

const submitChecklist = async (req, res) => {
  try {
    const { checklistId } = req.params;
    const { notes, submitted_by } = req.body;
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;

    logger.info(`[Real-Time] Processing submission for checklist: ${checklistId} (Store: ${storeId})`);

    const checklist = await Checklist.findOne({ checklist_id: checklistId });
    if (!checklist) {
      logger.error(`[Real-Time] Checklist not found: ${checklistId}`);
      return res.status(404).json({
        success: false,
        error: 'Checklist not found',
      });
    }

    checklist.status = 'completed';
    checklist.submitted_by = submitted_by || 'System User';
    checklist.notes = notes;
    
    // Ensure it shows 100% on submission
    checklist.completed_items = checklist.total_items;
    checklist.progress = 100;
    
    await checklist.save();

    logger.info(`[Real-Time] Checklist ${checklistId} successfully saved to DB`);

    // Log action
    try {
      await AuditLog.create({
        id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString(),
        action_type: 'update',
        user: submitted_by || 'System User',
        module: 'health',
        action: 'SUBMIT_CHECKLIST',
        details: { checklistId, checklistType: checklist.checklist_type, notes },
        store_id: checklist.store_id || storeId
      });
      logger.info(`[Real-Time] Audit log created for submission: ${checklistId}`);
    } catch (auditError) {
      logger.error(`[Real-Time] Failed to create audit log for ${checklistId}:`, auditError.message);
      // We don't fail the request if just the audit log fails
    }

    res.json({
      success: true,
      checklist_id: checklist.checklist_id,
      status: checklist.status,
      message: 'Checklist submitted successfully',
    });
  } catch (error) {
    logger.error(`[Real-Time] Error in submitChecklist:`, error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to submit checklist',
    });
  }
};

const getEquipment = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const deviceType = req.query.deviceType || 'all';

    const query = { store_id: storeId };
    if (deviceType !== 'all') {
      if (deviceType === 'handheld') {
        query.device_type = { $regex: /handheld|zebra|tc/i };
      } else if (deviceType === 'scanner') {
        query.device_type = { $regex: /scanner|ring/i };
      }
    }

    const devices = await Device.find(query).lean();

    const handheldDevices = devices.filter((d) => d.device_type.toLowerCase().includes('handheld') || d.device_type.toLowerCase().includes('zebra'));
    const scanners = devices.filter((d) => d.device_type.toLowerCase().includes('scanner'));

    const networkStatus = await NetworkStatus.findOne({ store_id: storeId }).sort({ createdAt: -1 });
    const powerBackup = await PowerBackup.findOne({ store_id: storeId }).sort({ createdAt: -1 });

    res.json({
      success: true,
      summary: {
        handheld_devices: {
          total: handheldDevices.length,
          active: handheldDevices.filter((d) => d.status === 'Active').length,
          offline: handheldDevices.filter((d) => d.status === 'Offline').length,
        },
        scanners: {
          total: scanners.length,
          online: scanners.filter((d) => d.status === 'Online' || d.status === 'Active').length,
          offline: scanners.filter((d) => d.status === 'Offline').length,
        },
        network: {
          status: networkStatus?.status || 'Online',
          signal_strength: networkStatus?.signal_strength || 98,
          latency: networkStatus?.latency || 12,
        },
        power: {
          battery_level: powerBackup?.battery_level || 100,
          runtime: powerBackup?.runtime || '4h 20m',
        },
      },
      devices: devices.map((d) => ({
        device_id: d.device_id,
        device_type: d.device_type,
        assigned_to: d.assigned_to,
        battery_level: d.battery_level,
        signal_strength: d.signal_strength,
        status: d.status,
        last_seen: d.last_seen,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch equipment status',
    });
  }
};

const getIncidents = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const status = req.query.status || 'all';
    const type = req.query.type || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const query = { store_id: storeId };
    if (status !== 'all') {
      query.status = status;
    }
    if (type !== 'all') {
      query.type = type;
    }

    const incidents = await Incident.find(query)
      .sort({ reported_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Incident.countDocuments(query);

    const allIncidents = await Incident.find({ store_id: storeId }).sort({ reported_at: -1 }).lean();
    const accidentsThisWeek = allIncidents.filter((i) => i.type === 'accident' && new Date(i.reported_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length;
    const openHazards = allIncidents.filter((i) => i.type === 'hazard' && i.status === 'open').length;
    
    // Calculate days safe
    const lastAccident = allIncidents.find(i => i.type === 'accident');
    let daysSafe = 14; // Default
    if (lastAccident) {
      const diffTime = Math.abs(new Date() - new Date(lastAccident.reported_at));
      daysSafe = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }

    res.json({
      success: true,
      incidents: incidents.map((i) => ({
        incident_id: i.incident_id,
        type: i.type,
        location: i.location,
        description: i.description,
        reported_by: i.reported_by,
        reported_at: i.reported_at,
        status: i.status === 'resolved' ? 'Resolved' : 'Open', // Normalize for frontend
        resolved_at: i.resolved_at,
        resolved_by: i.resolved_by,
      })),
      summary: {
        accidents_this_week: accidentsThisWeek,
        days_safe: daysSafe,
        open_hazards: openHazards,
        safety_audits_status: 'Up to Date',
      },
      pagination: {
        current_page: page,
        total_pages: Math.ceil(total / limit),
        total_items: total,
        items_per_page: limit,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch incidents',
    });
  }
};

const reportIncident = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const { type, location, description, reported_by, priority } = req.body;

    const incidentId = `INC-${Date.now().toString().slice(-6)}`;

    const incident = new Incident({
      incident_id: incidentId,
      type,
      location,
      description,
      reported_by,
      reported_at: new Date(),
      status: 'open',
      priority,
      store_id: storeId,
    });

    await incident.save();

    // Log action
    await AuditLog.create({
      id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      action_type: 'create',
      user: reported_by || 'System User',
      module: 'health',
      action: 'REPORT_INCIDENT',
      details: { incident_id: incident.incident_id, type, location, priority },
      store_id: storeId
    });

    res.json({
      success: true,
      incident_id: incident.incident_id,
      message: 'Incident reported successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to report incident',
    });
  }
};

const resolveIncident = async (req, res) => {
  try {
    const { incidentId } = req.params;
    const { resolved_by, resolution_notes } = req.body;

    const incident = await Incident.findOneAndUpdate(
      { incident_id: incidentId },
      {
        status: 'resolved',
        resolved_at: new Date(),
        resolved_by,
        resolution_notes,
      },
      { new: true }
    );

    if (!incident) {
      return res.status(404).json({
        success: false,
        error: 'Incident not found',
      });
    }

    // Log action
    await AuditLog.create({
      id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      action_type: 'update',
      user: resolved_by || 'System User',
      module: 'health',
      action: 'RESOLVE_INCIDENT',
      details: { incident_id: incident.incident_id, resolution_notes },
      store_id: incident.store_id
    });

    res.json({
      success: true,
      incident_id: incident.incident_id,
      status: incident.status,
      message: 'Incident resolved successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to resolve incident',
    });
  }
};

module.exports = {
  getHealthSummary,
  getChecklists,
  updateChecklistItem,
  submitChecklist,
  getEquipment,
  getIncidents,
  reportIncident,
  resolveIncident,
};

