/**
 * Database Backup Utility
 * Provides automated backup functionality for SQLite database
 */

import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

/**
 * Create a backup of the database
 * @param {Database} db - Better-sqlite3 database instance
 * @param {string} userDataPath - Path to user data directory
 * @returns {boolean} - Success status
 */
export function createBackup(db, userDataPath) {
  try {
    const backupDir = path.join(userDataPath, 'backups');
    
    // Ensure backup directory exists
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Create backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = path.join(backupDir, `attendance-backup-${timestamp}.db`);

    // Use SQLite backup API
    db.backup(backupPath);

    logger.info('Database backup created', { path: backupPath });

    // Cleanup old backups (keep last 7)
    cleanupOldBackups(backupDir, 7);

    return true;
  } catch (err) {
    logger.error('Failed to create database backup', { error: err.message });
    return false;
  }
}

/**
 * Delete old backup files, keeping only the most recent N backups
 * @param {string} backupDir - Backup directory path
 * @param {number} keepCount - Number of backups to keep
 */
function cleanupOldBackups(backupDir, keepCount = 7) {
  try {
    const files = fs.readdirSync(backupDir);
    const backupFiles = files
      .filter(f => f.startsWith('attendance-backup-') && f.endsWith('.db'))
      .map(f => ({
        name: f,
        path: path.join(backupDir, f),
        time: fs.statSync(path.join(backupDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time); // Sort by time, newest first

    // Delete old backups
    if (backupFiles.length > keepCount) {
      const toDelete = backupFiles.slice(keepCount);
      for (const file of toDelete) {
        try {
          fs.unlinkSync(file.path);
          logger.debug('Deleted old backup', { file: file.name });
        } catch (err) {
          logger.warn('Failed to delete old backup', { file: file.name, error: err.message });
        }
      }
    }
  } catch (err) {
    logger.error('Failed to cleanup old backups', { error: err.message });
  }
}

/**
 * Schedule automatic daily backups
 * @param {Database} db - Better-sqlite3 database instance
 * @param {string} userDataPath - Path to user data directory
 */
export function scheduleAutomaticBackups(db, userDataPath) {
  // Create initial backup on startup
  createBackup(db, userDataPath);

  // Schedule daily backups at 2 AM
  const now = new Date();
  const scheduledTime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1, // Next day
    2, // 2 AM
    0,
    0
  );

  const msUntilFirstBackup = scheduledTime.getTime() - now.getTime();

  // First backup
  setTimeout(() => {
    createBackup(db, userDataPath);

    // Then schedule daily backups
    setInterval(() => {
      createBackup(db, userDataPath);
    }, 24 * 60 * 60 * 1000); // Every 24 hours
  }, msUntilFirstBackup);

  logger.info('Automatic database backups scheduled', { nextBackup: scheduledTime.toISOString() });
}
