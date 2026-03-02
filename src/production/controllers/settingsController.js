const Settings = require('../models/Settings');
const AuditLog = require('../models/AuditLog');
const { generateId } = require('../../utils/helpers');
const logger = require('../../core/utils/logger');

/**
 * Get Application Settings
 * GET /api/darkstore/settings
 */
const getSettings = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    
    let settings = await Settings.findOne({ store_id: storeId });
    
    // If no settings exist, create default settings
    if (!settings) {
      settings = new Settings({
        store_id: storeId,
      });
      await settings.save();
    }
    
    res.status(200).json({
      success: true,
      settings: {
        refreshIntervals: settings.refreshIntervals,
        storeMode: settings.storeMode,
        notifications: settings.notifications,
        display: settings.display,
        performance: settings.performance,
        outbound: settings.outbound,
      },
      lastUpdated: settings.lastUpdated,
    });
  } catch (error) {
    logger.error('Error fetching settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch settings',
    });
  }
};

/**
 * Update Application Settings
 * PUT /api/darkstore/settings
 */
const updateSettings = async (req, res) => {
  try {
    const storeId = req.body.storeId || req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const { settings: newSettings } = req.body;
    
    if (!newSettings) {
      return res.status(400).json({
        success: false,
        error: 'Settings object is required',
      });
    }
    
    // Validate refresh intervals
    if (newSettings.refreshIntervals) {
      for (const [key, value] of Object.entries(newSettings.refreshIntervals)) {
        if (typeof value !== 'number' || value < 5 || value > 300) {
          return res.status(400).json({
            success: false,
            error: `Invalid refresh interval for ${key}. Must be between 5 and 300 seconds.`,
          });
        }
      }
    }

    // Validate store mode
    if (newSettings.storeMode && !['online', 'pause', 'maintenance'].includes(newSettings.storeMode)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid store mode. Must be online, pause, or maintenance.',
      });
    }
    
    // Update or create settings
    const settings = await Settings.findOneAndUpdate(
      { store_id: storeId },
      {
        $set: {
          ...(newSettings.refreshIntervals && { refreshIntervals: newSettings.refreshIntervals }),
          ...(newSettings.storeMode && { storeMode: newSettings.storeMode }),
          ...(newSettings.notifications && { notifications: newSettings.notifications }),
          ...(newSettings.display && { display: newSettings.display }),
          ...(newSettings.performance && { performance: newSettings.performance }),
          ...(newSettings.outbound && { outbound: newSettings.outbound }),
          lastUpdated: new Date(),
          updatedBy: req.body.updatedBy || 'system',
        },
      },
      { new: true, upsert: true }
    );

    // Create audit log
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: new Date().toISOString(),
      action_type: 'update',
      module: 'settings',
      user: req.body.updatedBy || 'system',
      action: 'UPDATE_SETTINGS',
      details: {
        updated_fields: Object.keys(newSettings)
      },
      store_id: storeId,
    });
    
    res.status(200).json({
      success: true,
      settings: {
        refreshIntervals: settings.refreshIntervals,
        storeMode: settings.storeMode,
        notifications: settings.notifications,
        display: settings.display,
        performance: settings.performance,
        outbound: settings.outbound,
      },
      lastUpdated: settings.lastUpdated,
      message: 'Settings updated successfully',
    });
  } catch (error) {
    logger.error('Error updating settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update settings',
    });
  }
};

module.exports = {
  getSettings,
  updateSettings,
};

