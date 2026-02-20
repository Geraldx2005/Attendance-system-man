/**
 * Centralized Validation Utilities
 * Provides secure validation for all user inputs
 */

/**
 * Validate employee ID format
 * Allows: alphanumeric, hyphens, max 20 characters
 * Examples: EMP001, FT-123, Employee-001
 */
export function validateEmployeeId(employeeId) {
  if (!employeeId || typeof employeeId !== 'string') {
    return { valid: false, error: 'Employee ID is required' };
  }

  const trimmed = employeeId.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Employee ID cannot be empty' };
  }

  if (trimmed.length > 20) {
    return { valid: false, error: 'Employee ID must be 20 characters or less' };
  }

  // Only alphanumeric and hyphens allowed
  if (!/^[a-zA-Z0-9-]+$/.test(trimmed)) {
    return { valid: false, error: 'Employee ID can only contain letters, numbers, and hyphens' };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate employee name
 * Allows: letters, spaces, hyphens, apostrophes
 * Min: 2 characters, Max: 100 characters
 */
export function validateEmployeeName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Employee name is required' };
  }

  const trimmed = name.trim();

  if (trimmed.length < 2) {
    return { valid: false, error: 'Employee name must be at least 2 characters' };
  }

  if (trimmed.length > 100) {
    return { valid: false, error: 'Employee name must be 100 characters or less' };
  }

  // Only letters, spaces, hyphens, apostrophes, and periods allowed
  // This prevents XSS and SQL injection attempts
  if (!/^[a-zA-Z\s'-\.]+$/.test(trimmed)) {
    return { valid: false, error: 'Employee name can only contain letters, spaces, hyphens, apostrophes, and periods' };
  }

  return { valid: true, value: trimmed };
}

/**
 * Sanitize filename for safe file system operations
 * Removes path separators and dangerous characters
 */
export function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return null;
  }

  // Remove any path components
  let sanitized = filename.replace(/^.*[\\\/]/, '');

  // Remove dangerous characters
  // Allow: alphanumeric, hyphens, underscores, periods, spaces
  sanitized = sanitized.replace(/[^a-zA-Z0-9-_. ]/g, '');

  // Prevent directory traversal
  sanitized = sanitized.replace(/\.\./g, '');

  // Limit length
  if (sanitized.length > 255) {
    sanitized = sanitized.substring(0, 255);
  }

  return sanitized || null;
}

/**
 * Validate file size
 * @param {number} sizeBytes - File size in bytes
 * @param {number} maxMB - Maximum size in megabytes (default: 10MB)
 */
export function validateFileSize(sizeBytes, maxMB = 10) {
  const maxBytes = maxMB * 1024 * 1024;

  if (typeof sizeBytes !== 'number' || sizeBytes < 0) {
    return { valid: false, error: 'Invalid file size' };
  }

  if (sizeBytes === 0) {
    return { valid: false, error: 'File is empty' };
  }

  if (sizeBytes > maxBytes) {
    return { valid: false, error: `File size exceeds ${maxMB}MB limit` };
  }

  return { valid: true, sizeBytes };
}

/**
 * Validate file extension
 * @param {string} filename - Filename to validate
 * @param {string[]} allowedExtensions - Array of allowed extensions (e.g., ['.csv', '.xlsx'])
 */
export function validateFileExtension(filename, allowedExtensions = ['.dat', '.csv', '.xls', '.xlsx']) {
  if (!filename || typeof filename !== 'string') {
    return { valid: false, error: 'Invalid filename' };
  }

  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));

  if (!allowedExtensions.includes(ext)) {
    return { 
      valid: false, 
      error: `Invalid file type. Allowed types: ${allowedExtensions.join(', ')}` 
    };
  }

  return { valid: true, extension: ext };
}

/**
 * Validate CSV path
 * Ensures path exists and is accessible
 */
export function validatePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, error: 'Invalid path' };
  }

  const trimmed = filePath.trim();

  // Prevent path traversal
  if (trimmed.includes('..')) {
    return { valid: false, error: 'Path traversal not allowed' };
  }

  // Basic path validation (OS-agnostic)
  if (trimmed.length === 0) {
    return { valid: false, error: 'Path cannot be empty' };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate date string (YYYY-MM-DD format)
 */
export function validateDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return { valid: false, error: 'Invalid date' };
  }

  // Check format YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    return { valid: false, error: 'Date must be in YYYY-MM-DD format' };
  }

  // Validate actual date
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Invalid date value' };
  }

  // Check if date is reasonable (not too far in past or future)
  const year = date.getFullYear();
  if (year < 2020 || year > 2100) {
    return { valid: false, error: 'Date year must be between 2020 and 2100' };
  }

  return { valid: true, value: dateStr };
}

/**
 * Validate time string (HH:MM or HH:MM:SS format)
 */
export function validateTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') {
    return { valid: false, error: 'Invalid time' };
  }

  // Check format HH:MM or HH:MM:SS
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])(:([0-5][0-9]))?$/;
  if (!timeRegex.test(timeStr)) {
    return { valid: false, error: 'Time must be in HH:MM or HH:MM:SS format' };
  }

  return { valid: true, value: timeStr };
}
