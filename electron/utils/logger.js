/**
 * Structured Logging Utility
 * Provides secure logging with sensitive data redaction
 */

import fs from 'fs';
import path from 'path';

// Log levels
export const LogLevel = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG',
  AUDIT: 'AUDIT',
};

const LOG_LEVELS_PRIORITY = {
  ERROR: 0,
  WARN: 1,
  AUDIT: 2,
  INFO: 3,
  DEBUG: 4,
};

class Logger {
  constructor() {
    this.logDir = null;
    this.currentLogLevel = LogLevel.INFO;
    this.maxLogFiles = 30; // Keep last 30 days
  }

  /**
   * Initialize logger with log directory
   */
  init(userDataPath) {
    if (!userDataPath) {
      console.warn('Logger: No user data path provided, logging to console only');
      return;
    }

    this.logDir = path.join(userDataPath, 'logs');

    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      // Clean up old logs
      this.cleanupOldLogs();
    } catch (err) {
      console.error('Logger: Failed to initialize log directory:', err.message);
      this.logDir = null;
    }
  }

  /**
   * Set log level (ERROR, WARN, INFO, DEBUG)
   */
  setLogLevel(level) {
    if (LOG_LEVELS_PRIORITY.hasOwnProperty(level)) {
      this.currentLogLevel = level;
    }
  }

  /**
   * Check if level should be logged
   */
  shouldLog(level) {
    return LOG_LEVELS_PRIORITY[level] <= LOG_LEVELS_PRIORITY[this.currentLogLevel];
  }

  /**
   * Format log message
   */
  formatMessage(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(metadata).length > 0 
      ? ' | ' + JSON.stringify(this.redactSensitiveData(metadata))
      : '';
    
    return `[${timestamp}] [${level}] ${message}${metaStr}`;
  }

  /**
   * Redact sensitive data from logs
   */
  redactSensitiveData(data) {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const redacted = { ...data };
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth'];

    for (const key in redacted) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
        redacted[key] = '***REDACTED***';
      }
    }

    return redacted;
  }

  /**
   * Get log file path for today
   */
  getLogFilePath() {
    if (!this.logDir) return null;

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.logDir, `app-${today}.log`);
  }

  /**
   * Write to log file
   */
  writeToFile(formattedMessage) {
    const logFile = this.getLogFilePath();
    if (!logFile) return;

    try {
      fs.appendFileSync(logFile, formattedMessage + '\n', 'utf8');
    } catch (err) {
      console.error('Logger: Failed to write to log file:', err.message);
    }
  }

  /**
   * Cleanup old log files (keep last N days)
   */
  cleanupOldLogs() {
    if (!this.logDir) return;

    try {
      const files = fs.readdirSync(this.logDir);
      const logFiles = files.filter(f => f.startsWith('app-') && f.endsWith('.log'));

      if (logFiles.length <= this.maxLogFiles) return;

      // Sort by date (oldest first)
      logFiles.sort();

      // Delete oldest files
      const toDelete = logFiles.slice(0, logFiles.length - this.maxLogFiles);
      for (const file of toDelete) {
        try {
          fs.unlinkSync(path.join(this.logDir, file));
        } catch (err) {
          // Ignore deletion errors
        }
      }
    } catch (err) {
      console.error('Logger: Failed to cleanup old logs:', err.message);
    }
  }

  /**
   * Log at specified level
   */
  log(level, message, metadata = {}) {
    if (!this.shouldLog(level)) return;

    const formatted = this.formatMessage(level, message, metadata);

    // Always write ERROR and WARN to console
    if (level === LogLevel.ERROR || level === LogLevel.WARN) {
      console.error(formatted);
    } else if (level === LogLevel.DEBUG) {
      console.debug(formatted);
    } else {
      console.log(formatted);
    }

    // Write all levels to file
    this.writeToFile(formatted);
  }

  /**
   * Convenience methods
   */
  error(message, metadata = {}) {
    this.log(LogLevel.ERROR, message, metadata);
  }

  warn(message, metadata = {}) {
    this.log(LogLevel.WARN, message, metadata);
  }

  info(message, metadata = {}) {
    this.log(LogLevel.INFO, message, metadata);
  }

  debug(message, metadata = {}) {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  /**
   * Audit log - special type for security events
   * Always logged regardless of log level
   */
  audit(action, details = {}) {
    const message = `AUDIT: ${action}`;
    const formatted = this.formatMessage(LogLevel.AUDIT, message, details);
    
    console.log(formatted);
    this.writeToFile(formatted);

    // Also write to separate audit log
    this.writeToAuditLog(formatted);
  }

  /**
   * Write to separate audit log file
   */
  writeToAuditLog(formattedMessage) {
    if (!this.logDir) return;

    const auditFile = path.join(this.logDir, 'audit.log');

    try {
      fs.appendFileSync(auditFile, formattedMessage + '\n', 'utf8');
    } catch (err) {
      console.error('Logger: Failed to write to audit log:', err.message);
    }
  }
}

// Export singleton instance
const logger = new Logger();
export default logger;
