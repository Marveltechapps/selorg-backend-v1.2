/**
 * Migration Runner
 * File: src/migrations/migration.runner.js
 *
 * P2.2: Executes migrations in sequence with rollback capability
 */

const logger = require('../core/utils/logger');
const migration001 = require('./001_add_order_type');
const migration002 = require('./002_add_user_type');
const migration003 = require('./003_create_type_indexes');

const MIGRATIONS = [migration001, migration002, migration003];

/**
 * Run all pending migrations
 */
const runMigrations = async (db) => {
  const results = [];

  for (const migration of MIGRATIONS) {
    try {
      logger.info(`[MigrationRunner] Running: ${migration.name}`);

      const result = await migration.migrate(db);

      results.push({
        name: migration.name,
        status: 'SUCCESS',
        result
      });

      logger.info(`[MigrationRunner] Completed: ${migration.name}`);
    } catch (error) {
      logger.error(`[MigrationRunner] Failed: ${migration.name}`, error);

      results.push({
        name: migration.name,
        status: 'FAILED',
        error: error.message
      });

      // Stop on first failure
      throw error;
    }
  }

  return results;
};

/**
 * Rollback migrations in reverse order
 */
const rollbackMigrations = async (db) => {
  const results = [];

  // Rollback in reverse order
  for (let i = MIGRATIONS.length - 1; i >= 0; i--) {
    const migration = MIGRATIONS[i];

    try {
      logger.info(`[MigrationRunner] Rolling back: ${migration.name}`);

      const result = await migration.rollback(db);

      results.push({
        name: migration.name,
        status: 'SUCCESS',
        result
      });

      logger.info(`[MigrationRunner] Rolled back: ${migration.name}`);
    } catch (error) {
      logger.error(`[MigrationRunner] Rollback failed: ${migration.name}`, error);

      results.push({
        name: migration.name,
        status: 'FAILED',
        error: error.message
      });
    }
  }

  return results;
};

/**
 * Get list of all migrations
 */
const getMigrations = () => {
  return MIGRATIONS.map((m) => ({
    name: m.name,
    hasMigrate: typeof m.migrate === 'function',
    hasRollback: typeof m.rollback === 'function'
  }));
};

module.exports = {
  runMigrations,
  rollbackMigrations,
  getMigrations,
  MIGRATIONS
};
