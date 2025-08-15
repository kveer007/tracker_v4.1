/**
 * Health Tracker App - Legacy Notification File (Deprecated)
 * 
 * This file is deprecated as of v2.1. All notification functionality 
 * has been moved to RemindersManager in reminders/reminders-scripts.js
 * 
 * This file can be safely removed in future versions.
 */

console.warn('notification.js is deprecated. Use RemindersManager instead.');

// Export empty object to prevent errors if something tries to import
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {};
}