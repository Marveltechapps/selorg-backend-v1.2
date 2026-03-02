const ProductionLine = require('../models/ProductionLine');
const Factory = require('../models/Factory');
const QCInspection = require('../models/QCInspection');
const { generateId } = require('../../utils/helpers');

/**
 * GET /api/v1/production/overview
 * Returns overview KPIs and production lines for a factory
 */
const getOverview = async (req, res) => {
  try {
    const factoryId = req.query.factoryId || process.env.DEFAULT_FACTORY_ID;
    if (!factoryId) {
      return res.status(400).json({
        success: false,
        error: 'factoryId is required',
      });
    }

    const lines = await ProductionLine.find({ factory_id: factoryId }).lean();
    const totalOutput = lines.reduce((sum, l) => sum + (l.output || 0), 0);
    const totalTarget = lines.reduce((sum, l) => sum + (l.target || 0), 0);
    const avgEfficiency = lines.length > 0
      ? Math.round(lines.reduce((sum, l) => sum + (l.efficiency || 0), 0) / lines.length)
      : 0;
    const defectRates = lines.filter((l) => l.defect_rate != null).map((l) => l.defect_rate);
    let defectRate = defectRates.length > 0
      ? (defectRates.reduce((a, b) => a + b, 0) / defectRates.length).toFixed(2)
      : null;

    // When no line defect_rate available, source from QCInspection data
    if (defectRate == null) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const qcMatch = { createdAt: { $gte: thirtyDaysAgo } };
      if (factoryId) qcMatch.$or = [{ factory_id: factoryId }, { store_id: factoryId }];
      const qcInspections = await QCInspection.find(qcMatch).lean();
      const totalItems = qcInspections.reduce((s, q) => s + (q.items_inspected || 0), 0);
      const totalDefects = qcInspections.reduce((s, q) => s + (q.defects_found || 0), 0);
      if (totalItems > 0) {
        defectRate = (totalDefects / totalItems).toFixed(2);
      }
    }

    if (defectRate == null) defectRate = '0.40';
    const downtimeCount = lines.filter((l) => l.status !== 'running').length;
    const activeDowntime = downtimeCount * 15;

    const transformedLines = lines.map((l) => ({
      id: l.line_id,
      name: l.name,
      currentJob: l.currentJob || undefined,
      status: l.status,
      output: l.output || 0,
      target: l.target || 0,
      efficiency: l.efficiency || 0,
    }));

    res.status(200).json({
      success: true,
      lines: transformedLines,
      kpis: {
        totalOutput,
        totalTarget,
        avgEfficiency,
        defectRate: parseFloat(defectRate),
        activeDowntime,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch overview',
    });
  }
};

/**
 * POST /api/v1/production/overview/batch
 * Start a new production batch on a line
 */
const startBatch = async (req, res) => {
  try {
    const { lineId, product, targetQuantity } = req.body;
    if (!lineId || !product || !targetQuantity || targetQuantity < 1) {
      return res.status(400).json({
        success: false,
        error: 'lineId, product, and targetQuantity (positive number) are required',
      });
    }

    const line = await ProductionLine.findOne({ line_id: lineId });
    if (!line) {
      return res.status(404).json({
        success: false,
        error: 'Line not found',
      });
    }

    const batchNumber = Math.floor(1000 + Math.random() * 9000);
    const currentJob = `Job #${batchNumber} - ${product}`;

    line.currentJob = currentJob;
    line.status = 'running';
    line.target = parseInt(targetQuantity, 10);
    line.output = 0;
    line.efficiency = 0;
    line.updated_at = new Date();
    await line.save();

    res.status(200).json({
      success: true,
      line: {
        id: line.line_id,
        name: line.name,
        currentJob: line.currentJob,
        status: line.status,
        output: line.output,
        target: line.target,
        efficiency: line.efficiency,
      },
      message: 'Batch started successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start batch',
    });
  }
};

/**
 * PATCH /api/v1/production/overview/lines/:lineId
 * Pause, resume, or stop a line
 * Body: { action: 'pause' | 'resume' | 'stop' }
 */
const updateLine = async (req, res) => {
  try {
    const { lineId } = req.params;
    const { action } = req.body;
    if (!action || !['pause', 'resume', 'stop'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'action (pause, resume, or stop) is required',
      });
    }

    const line = await ProductionLine.findOne({ line_id: lineId });
    if (!line) {
      return res.status(404).json({
        success: false,
        error: 'Line not found',
      });
    }

    const now = new Date();
    if (action === 'pause') {
      line.status = 'idle';
    } else if (action === 'resume') {
      if (!line.currentJob) {
        return res.status(400).json({
          success: false,
          error: 'Line has no current job to resume',
        });
      }
      line.status = 'running';
    } else if (action === 'stop') {
      line.status = 'idle';
      line.currentJob = null;
      line.output = 0;
      line.target = 0;
      line.efficiency = 0;
    }
    line.updated_at = now;
    await line.save();

    res.status(200).json({
      success: true,
      line: {
        id: line.line_id,
        name: line.name,
        currentJob: line.currentJob || undefined,
        status: line.status,
        output: line.output,
        target: line.target,
        efficiency: line.efficiency,
      },
      message: `Line ${action}d successfully`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update line',
    });
  }
};

/**
 * GET /api/v1/production/factories
 * List all factories for factory selector
 */
const listFactories = async (req, res) => {
  try {
    const factories = await Factory.find({}).lean();
    const transformed = factories.map((f) => ({
      id: f.factory_id,
      name: f.name,
      code: f.code,
      status: f.status,
    }));
    res.status(200).json({
      success: true,
      factories: transformed,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch factories',
    });
  }
};

module.exports = {
  getOverview,
  startBatch,
  updateLine,
  listFactories,
};
