/**
 * Background runner for Content Hub master-sheet imports.
 * Upload returns 202 + jobId; this module executes importContentHubMaster off-request.
 */
const { ContentHubImportRun } = require('../../models/ContentHubImportRun');
const { importContentHubMaster } = require('./contentHubMasterImport.service');
const cacheService = require('../../../core/services/cache.service');

// Prevent overlapping Content Hub imports from racing `customer_home_section_definitions`
// unique-key upserts (can surface as E11000 on `key` under concurrent jobs).
// We still de-dupe per `jobId` to avoid running the same job twice.
const activeJobs = new Set();
let contentHubImportChain = Promise.resolve();

async function invalidateCustomerCachesSafely(cachePatterns = ['cache:*']) {
  try {
    for (const pattern of cachePatterns) {
      // eslint-disable-next-line no-await-in-loop
      await cacheService.delPattern(pattern);
    }
  } catch (err) {
    console.error('[ContentHubImportJob] cache invalidation failed', err?.message || err);
  }
}

async function patchJob(jobId, fields) {
  try {
    await ContentHubImportRun.updateOne({ _id: jobId }, { $set: fields });
  } catch (e) {
    console.error('[ContentHubImportJob] patch failed', jobId, e?.message || e);
  }
}

/**
 * @param {object} opts
 * @param {string|import('mongoose').Types.ObjectId} opts.jobId
 * @param {Buffer} opts.buffer
 * @param {boolean} [opts.overwrite]
 */
async function runContentHubImportJob({ jobId, buffer, overwrite = true }) {
  const id = String(jobId);
  // If the same job was already queued/rerun, skip it.
  if (activeJobs.has(id)) {
    console.warn('[ContentHubImportJob] already running', id);
    return;
  }

  const runTask = async () => {
    // Double-check inside the serialized chain.
    if (activeJobs.has(id)) return;

    activeJobs.add(id);
    const startedAt = Date.now();
    console.log(
      `[ContentHubImportJob] start job=${id} overwrite=${overwrite} bytes=${buffer?.length || 0}`
    );

    await patchJob(id, {
      status: 'running',
      progress: 1,
      stage: 'starting',
      stageMessage: 'Import job started',
      startedAt: new Date(startedAt),
      success: false,
    });

    try {
      const result = await importContentHubMaster(buffer, {
        overwrite,
        onProgress: async ({ stage, progress, message, stageTimings }) => {
          const fields = {
            status: 'running',
            stage: stage || 'running',
            stageMessage: message || '',
          };
          if (typeof progress === 'number' && Number.isFinite(progress)) {
            fields.progress = Math.max(0, Math.min(99, Math.round(progress)));
          }
          if (stageTimings && typeof stageTimings === 'object') {
            fields.stageTimings = stageTimings;
          }
          await patchJob(id, fields);
        },
      });

      const durationMs = Date.now() - startedAt;
      const success = Boolean(result?.success);
      if (success) {
        await invalidateCustomerCachesSafely();
      }

      await patchJob(id, {
        status: success ? 'completed' : 'failed',
        progress: 100,
        stage: 'done',
        stageMessage: success ? 'Import completed' : 'Import finished with errors',
        success,
        durationMs,
        finishedAt: new Date(),
        counts: result?.counts || {},
        warnings: Array.isArray(result?.warnings) ? result.warnings : [],
        importErrors: Array.isArray(result?.errors) ? result.errors : [],
        stageTimings: result?.stageTimings || {},
      });

      console.log(
        `[ContentHubImportJob] finished job=${id} success=${success} durationMs=${durationMs}`,
        result?.stageTimings || {}
      );
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      console.error(`[ContentHubImportJob] crashed job=${id}`, err);
      await patchJob(id, {
        status: 'failed',
        progress: 100,
        stage: 'done',
        stageMessage: err?.message || 'Import crashed',
        success: false,
        durationMs,
        finishedAt: new Date(),
        importErrors: [{ message: err?.message || String(err) }],
      });
    } finally {
      activeJobs.delete(id);
    }
  };

  // Serialize across all Content Hub master-sheet imports so home-section upserts
  // can't race each other on the unique `key` index.
  contentHubImportChain = contentHubImportChain.then(runTask, runTask);
  return contentHubImportChain;
}

function scheduleContentHubImportJob(opts) {
  // Detach from the request lifecycle; do not await in the HTTP handler.
  setImmediate(() => {
    runContentHubImportJob(opts).catch((err) => {
      console.error('[ContentHubImportJob] unhandled', err);
    });
  });
}

module.exports = {
  runContentHubImportJob,
  scheduleContentHubImportJob,
};
