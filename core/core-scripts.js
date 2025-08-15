/**
 * Health Tracker App - Core Scripts
 * Main application logic and initialization
 */

// Global constants for localStorage keys
const STORAGE_KEYS = {
  GOAL_PREFIX: 'goal_',
  INTAKE_PREFIX: 'intake_',
  HISTORY_PREFIX: 'history_',
  WORKOUT_TYPES: 'workout_types',
  WORKOUT_STATE: 'workout_state',
  WORKOUT_COUNT: 'workout_count',
  WORKOUT_HISTORY: 'workout_history',
  HABITS: 'habits_data',
  THEME: 'theme',
  REMINDER: 'reminder',
  LAST_RESET_PREFIX: 'last_reset_'
};

// Theme colors for different apps
const THEME_COLORS = {
  water: '#2196F3',
  protein: '#F44336',
  workout: '#4CAF50',
  habits: '#673AB7'
};

/**
 * Storage Manager - Handles localStorage operations with error handling
 */
const storageManager = {
  /**
   * Check if localStorage is available
   */
  isAvailable() {
    try {
      const test = '__localStorage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  },

  /**
   * Get storage usage information
   */
  getStorageInfo() {
    if (!this.isAvailable()) return null;
    
    try {
      // Calculate approximate usage
      let totalSize = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          totalSize += localStorage[key].length + key.length;
        }
      }
      
      // Most browsers have 5-10MB localStorage limit
      const estimatedLimit = 5 * 1024 * 1024; // 5MB in bytes
      const usagePercentage = (totalSize / estimatedLimit) * 100;
      
      return {
        used: totalSize,
        percentage: Math.round(usagePercentage),
        isNearLimit: usagePercentage > 80
      };
    } catch (e) {
      return null;
    }
  },

  /**
   * Check if storage is near quota
   */
  isNearQuota() {
    const info = this.getStorageInfo();
    return info && info.isNearLimit;
  },

  /**
   * Clean up old data to free space
   */
  cleanupOldData() {
    try {
      // Remove old history entries beyond 90 days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);
      const cutoffString = cutoffDate.toISOString().split('T')[0];
      
      ['water', 'protein'].forEach(type => {
        const historyKey = STORAGE_KEYS.HISTORY_PREFIX + type;
        const history = JSON.parse(localStorage.getItem(historyKey) || '{}');
        
        let cleaned = false;
        Object.keys(history).forEach(date => {
          if (date < cutoffString) {
            delete history[date];
            cleaned = true;
          }
        });
        
        if (cleaned) {
          localStorage.setItem(historyKey, JSON.stringify(history));
        }
      });
      
      console.log('Cleaned up old data beyond 90 days');
      return true;
    } catch (e) {
      console.error('Error cleaning up data:', e);
      return false;
    }
  }
};

/**
 * Utility functions
 */
const utils = {
  /**
   * Format date to YYYY-MM-DD format (CRITICAL FIX - was missing)
   * @param {Date} date - Date object to format
   * @returns {string} Date in YYYY-MM-DD format
   */
  formatDate(date) {
    if (!date) return this.getCurrentDate();
    if (typeof date === 'string') return date; // Already formatted
    
    const d = new Date(date);
    return d.getFullYear() + '-' + 
           String(d.getMonth() + 1).padStart(2, '0') + '-' + 
           String(d.getDate()).padStart(2, '0');
  },

  /**
   * Get current date in YYYY-MM-DD format
   * @returns {string} Current date
   */
  getCurrentDate() {
    const today = new Date();
    return today.getFullYear() + '-' + 
           String(today.getMonth() + 1).padStart(2, '0') + '-' + 
           String(today.getDate()).padStart(2, '0');
  },

  /**
   * Get date N days ago in YYYY-MM-DD format
   * @param {number} daysAgo - Number of days ago
   * @returns {string} Date in YYYY-MM-DD format
   */
  getDateDaysAgo(daysAgo) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return this.formatDate(date);
  },

  /**
   * Get days between two dates
   * @param {string} startDate - Start date in YYYY-MM-DD format
   * @param {string} endDate - End date in YYYY-MM-DD format
   * @returns {number} Number of days between dates
   */
  getDaysBetween(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  },

  /**
   * Show toast notification
   * @param {string} message - Message to display
   * @param {string} type - Type of toast (success, warning, error, info)
   * @param {number} duration - Duration in milliseconds (default: 3000)
   */
  showToast(message, type = 'info', duration = 3000) {
    const toastContainer = document.getElementById('toast-container');
    
    if (!toastContainer) {
      console.error('Toast container not found');
      return;
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = document.createElement('i');
    icon.className = 'material-icons-round';
    
    switch (type) {
      case 'success':
        icon.textContent = 'check_circle';
        break;
      case 'warning':
        icon.textContent = 'warning';
        break;
      case 'error':
        icon.textContent = 'error';
        break;
      default:
        icon.textContent = 'info';
    }
    
    toast.appendChild(icon);
    toast.appendChild(document.createTextNode(message));
    toastContainer.appendChild(toast);
    
    // Remove toast after specified duration
    setTimeout(() => {
      toast.classList.add('toast-closing');
      setTimeout(() => {
        if (toast.parentNode) {
          toastContainer.removeChild(toast);
        }
      }, 300);
    }, duration);
    
    // Limit max number of toasts to 3
    const toasts = toastContainer.querySelectorAll('.toast');
    if (toasts.length > 3) {
      toastContainer.removeChild(toasts[0]);
    }
  },
  
  /**
   * Change the theme color in the meta tag
   */
  changeThemeColor(color) {
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.setAttribute('name', 'theme-color');
      document.head.appendChild(metaThemeColor);
    }
    
    metaThemeColor.setAttribute('content', color);
  }
};

/**
 * Initialize the application when DOM is fully loaded
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing app...');
  
  // Check if localStorage is available
  if (!storageManager.isAvailable()) {
    alert('Your browser does not support local storage or it is disabled. The app may not work properly.');
    return;
  }
  
  // Check if we're near quota
  if (storageManager.isNearQuota()) {
    utils.showToast('Storage space is running low. Consider exporting and clearing old data.', 'warning');
    storageManager.cleanupOldData();
  }

  // Initialize trackers with error handling
  try {
    console.log('Initializing water tracker...');
    window.waterTracker = new Tracker({ type: 'water', unit: 'ml' });
    console.log('Water tracker initialized successfully');
    
    console.log('Initializing protein tracker...');
    window.proteinTracker = new Tracker({ type: 'protein', unit: 'g' });
    console.log('Protein tracker initialized successfully');
    
    console.log('Initializing workout tracker...');
    window.workoutTracker = new WorkoutTracker();
    console.log('Workout tracker initialized successfully');
    
    console.log('Initializing habits tracker...');
    window.habitsTracker = new HabitsTracker();
    console.log('Habits tracker initialized successfully');
    
    console.log('All trackers initialized successfully');
  } catch (error) {
    console.error('Error initializing trackers:', error);
    utils.showToast('Error initializing trackers: ' + error.message, 'error');
  }
  
  // Initialize reminders manager with better error handling
  try {
    console.log('Initializing RemindersManager...');
    window.remindersManager = new RemindersManager();
    
    // Verify initialization was successful
    if (window.remindersManager && typeof window.remindersManager.togglePanel === 'function') {
      console.log('RemindersManager initialized successfully');
    } else {
      throw new Error('RemindersManager initialization incomplete');
    }
  } catch (error) {
    console.error('Error initializing RemindersManager:', error);
    utils.showToast('Error initializing reminders system: ' + error.message, 'error');
    
    // Create minimal fallback
    window.remindersManager = {
      togglePanel: () => console.warn('RemindersManager not available'),
      openPanel: () => console.warn('RemindersManager not available'),
      data: { globalEnabled: false, systemNotifications: {}, customReminders: [] }
    };
  }
  
  // Set up theme with error handling
  try {
    initializeTheme();
    console.log('Theme initialized');
  } catch (error) {
    console.error('Error initializing theme:', error);
  }
  
  // Set up tab navigation with error handling
  try {
    initializeTabNavigation();
    console.log('Tab navigation initialized');
  } catch (error) {
    console.error('Error initializing tab navigation:', error);
  }
  
  // Set up panels (settings, history, more options) with error handling
  try {
    initializePanels();
    console.log('Panels initialized');
  } catch (error) {
    console.error('Error initializing panels:', error);
  }
  
  // Initialize settings panel events
  try {
    initializeSettingsPanelEvents();
    console.log('Settings panel events initialized');
  } catch (error) {
    console.error('Error initializing settings panel events:', error);
  }
  
  // Set up action buttons for trackers with error handling
  try {
    if (window.waterTracker) {
      initializeTrackerActions(window.waterTracker);
      console.log('Water tracker actions initialized');
    }
    
    if (window.proteinTracker) {
      initializeTrackerActions(window.proteinTracker);
      console.log('Protein tracker actions initialized');
    }
    
    if (window.workoutTracker) {
      initializeWorkoutTrackerActions(window.workoutTracker);
      console.log('Workout tracker actions initialized');
    }
  } catch (error) {
    console.error('Error initializing tracker actions:', error);
  }
  
  // Set up data import/export with error handling
  try {
    initializeDataManagement();
    console.log('Data management initialized');
  } catch (error) {
    console.error('Error initializing data management:', error);
  }
  
  // Apply initial theme color with error handling
  try {
    const isDarkTheme = document.body.classList.contains('dark-theme') || 
                        (!document.body.classList.contains('light-theme') && 
                         window.matchMedia('(prefers-color-scheme: dark)').matches);
    utils.changeThemeColor(isDarkTheme ? '#121212' : THEME_COLORS.water);
    console.log('Theme color applied');
  } catch (error) {
    console.error('Error applying theme color:', error);
  }
  
  // Update notification button states after initialization
  try {
    setTimeout(() => {
      if (window.remindersManager && typeof updateNotificationButtonStates === 'function') {
        updateNotificationButtonStates('water');
        updateNotificationButtonStates('protein');
        console.log('Notification button states initialized');
      }
    }, 500); // Small delay to ensure reminders manager is fully ready
  } catch (error) {
    console.error('Error initializing notification button states:', error);
  }
  
  // NEW: Handle notification URL parameters
  handleNotificationUrlParams();
  
  console.log('App initialization complete');
});

// NEW: Handle messages from service worker (notification clicks)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    console.log('📨 Message from service worker:', event.data);
    
    const { type, action, view, notificationType } = event.data;
    
    if (type === 'notification-click' && action === 'open-reminders') {
      // Open reminders panel
      if (window.remindersManager) {
        window.remindersManager.openPanel();
        
        // Navigate to specific view if specified
        if (view === 'server-settings') {
          setTimeout(() => {
            window.remindersManager.showServerSettings();
          }, 300);
        }
      }
      
      // Show toast message based on notification type
      if (notificationType === 'test') {
        utils.showToast('🧪 Test notification clicked! Server notifications are working.', 'success');
      } else if (notificationType === 'goal-alert') {
        utils.showToast('🎯 Goal reminder clicked! Check your progress.', 'info');
      } else if (notificationType === 'interval-reminder') {
        utils.showToast('⏰ Interval reminder clicked! Time to log your progress.', 'info');
      }
    }
  });
}

/**
 * NEW: Handle URL parameters for notification clicks that open new windows
 */
function handleNotificationUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const openPanel = urlParams.get('open');
  const view = urlParams.get('view');
  
  if (openPanel === 'reminders' && window.remindersManager) {
    // Small delay to ensure everything is loaded
    setTimeout(() => {
      window.remindersManager.openPanel();
      
      if (view === 'server-settings') {
        setTimeout(() => {
          window.remindersManager.showServerSettings();
        }, 300);
      }
    }, 500);
  }
}

/**
 * Initialize data import/export functionality
 */
function initializeDataManagement() {
  const exportBtn = document.getElementById('export-data');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportData);
  }
  
  const importFileInput = document.getElementById('import-file');
  if (importFileInput) {
    importFileInput.addEventListener('change', importData);
  }
}

/**
 * Export tracking data to CSV file
 */
function exportData() {
  try {
    const csvString = convertDataToCSV();
    const csvBlob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const csvUrl = URL.createObjectURL(csvBlob);
    
    const link = document.createElement('a');
    link.setAttribute('href', csvUrl);
    link.setAttribute('download', `health-tracker-export-${new Date().toISOString().slice(0,10)}.csv`);
    
    document.body.appendChild(link);
    link.click();
    
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(csvUrl);
    }, 100);
    
    utils.showToast('Data exported successfully as CSV!', 'success');
    document.getElementById('more-options-panel').classList.remove('active');
  } catch (error) {
    console.error('Export error:', error);
    utils.showToast(`Error exporting data: ${error.message}`, 'error');
  }
}

/**
 * Import tracking data from CSV file
 */
function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (file.size > 5 * 1024 * 1024) {
    utils.showToast('File is too large. Maximum size is 5MB.', 'error');
    event.target.value = '';
    return;
  }
  
  if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
    utils.showToast('Invalid file type. Please upload a CSV file.', 'error');
    event.target.value = '';
    return;
  }
  
  const reader = new FileReader();
  
  reader.onload = function(e) {
    try {
      const csvData = e.target.result;
      const importedData = parseCSVData(csvData);
      
      if (!importedData) {
        throw new Error('Import file is empty or corrupt.');
      }
      
      // Create backup before import
      const backup = {};
      Object.keys(localStorage).forEach(key => {
        backup[key] = localStorage.getItem(key);
      });
      
      try {
        applyImportedData(importedData);
        utils.showToast('Data imported successfully! Reloading app...', 'success');
        
        setTimeout(() => location.reload(), 1500);
      } catch (storageError) {
        console.error('Storage error during import:', storageError);
        
        // Restore backup
        localStorage.clear();
        Object.keys(backup).forEach(key => {
          localStorage.setItem(key, backup[key]);
        });
        
        throw new Error('Error saving imported data. Your previous data has been restored.');
      }
    } catch (error) {
      utils.showToast(`Error importing data: ${error.message}`, 'error');
      console.error('Import error:', error);
    }
    
    event.target.value = '';
  };
  
  reader.onerror = function() {
    utils.showToast('Error reading file. Please try again.', 'error');
    event.target.value = '';
  };
  
  reader.readAsText(file);
}

/**
 * Convert application data to CSV format (includes reminders)
 */
function convertDataToCSV() {
  const rows = []; 
  
  const headers = [
    "data_type", "key", "value", "date", "amount", "timestamp", 
    "type", "count", "name", "color", "completed", "order"
  ];
  rows.push(headers.join(","));
  
  const escapeCSV = (value) => {
    if (value === null || value === undefined) return '';
    const stringValue = String(value);
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };
  
  const addRow = (dataType, key, value) => {
    const row = new Array(headers.length).fill('');
    row[0] = dataType;
    row[1] = key;
    row[2] = value;
    rows.push(row.map(escapeCSV).join(','));
  };
  
  // Add version info
  addRow("meta", "version", "2.1");
  addRow("meta", "exportDate", new Date().toISOString());
  
  // Process water data
  const waterGoal = localStorage.getItem(STORAGE_KEYS.GOAL_PREFIX + 'water');
  addRow("water", "goal", waterGoal);
  
  const waterIntake = localStorage.getItem(STORAGE_KEYS.INTAKE_PREFIX + 'water');
  addRow("water", "intake", waterIntake);
  
  const waterHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY_PREFIX + 'water') || '{}');
  Object.entries(waterHistory).forEach(([date, entries]) => {
    entries.forEach((entry, index) => {
      const row = new Array(headers.length).fill('');
      row[0] = "water_history";
      row[1] = `${date}_${index}`;
      row[3] = date;
      row[4] = entry.amount;
      row[5] = entry.timestamp;
      rows.push(row.map(escapeCSV).join(','));
    });
  });
  
  // Process protein data
  const proteinGoal = localStorage.getItem(STORAGE_KEYS.GOAL_PREFIX + 'protein');
  addRow("protein", "goal", proteinGoal);
  
  const proteinIntake = localStorage.getItem(STORAGE_KEYS.INTAKE_PREFIX + 'protein');
  addRow("protein", "intake", proteinIntake);
  
  const proteinHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY_PREFIX + 'protein') || '{}');
  Object.entries(proteinHistory).forEach(([date, entries]) => {
    entries.forEach((entry, index) => {
      const row = new Array(headers.length).fill('');
      row[0] = "protein_history";
      row[1] = `${date}_${index}`;
      row[3] = date;
      row[4] = entry.amount;
      row[5] = entry.timestamp;
      rows.push(row.map(escapeCSV).join(','));
    });
  });
  
  // Process workout data
  const workoutTypes = localStorage.getItem(STORAGE_KEYS.WORKOUT_TYPES);
  addRow("workout", "types", workoutTypes);
  
  const workoutState = localStorage.getItem(STORAGE_KEYS.WORKOUT_STATE);
  addRow("workout", "state", workoutState);
  
  const workoutCount = localStorage.getItem(STORAGE_KEYS.WORKOUT_COUNT);
  addRow("workout", "count", workoutCount);
  
  const workoutHistory = localStorage.getItem(STORAGE_KEYS.WORKOUT_HISTORY);
  if (workoutHistory) {
    const history = JSON.parse(workoutHistory);
    Object.entries(history).forEach(([date, workouts]) => {
      workouts.forEach((workout, index) => {
        const row = new Array(headers.length).fill('');
        row[0] = "workout_history";
        row[1] = `${date}_${index}`;
        row[3] = date;
        row[6] = workout.type;
        row[7] = workout.count || 0;
        row[10] = workout.completed || false;
        rows.push(row.map(escapeCSV).join(','));
      });
    });
  }
  
  // Process habits data
  const habitsData = localStorage.getItem(STORAGE_KEYS.HABITS);
  if (habitsData) {
    const habits = JSON.parse(habitsData);
    habits.forEach((habit, habitIndex) => {
      const row = new Array(headers.length).fill('');
      row[0] = "habit";
      row[1] = `habit_${habitIndex}`;
      row[8] = habit.name;
      row[9] = habit.color;
      rows.push(row.map(escapeCSV).join(','));
      
      if (habit.history) {
        Object.entries(habit.history).forEach(([date, status]) => {
          const historyRow = new Array(headers.length).fill('');
          historyRow[0] = "habit_history";
          historyRow[1] = `${habitIndex}_${date}`;
          historyRow[2] = status;
          historyRow[3] = date;
          rows.push(historyRow.map(escapeCSV).join(','));
        });
      }
    });
  }
  
  // Process reminders data
  const remindersData = localStorage.getItem('reminders_data');
  if (remindersData) {
    addRow("reminders", "data", remindersData);
  }
  
  // Add settings
  const theme = localStorage.getItem(STORAGE_KEYS.THEME);
  addRow("settings", "theme", theme);
  
  const reminder = localStorage.getItem(STORAGE_KEYS.REMINDER);
  addRow("settings", "reminder", reminder);
  
  return rows.join('\n');
}

/**
 * Parse CSV data and import to app (includes reminders)
 */
function parseCSVData(csvData) {
  const rows = csvData.split(/\r?\n/);
  if (rows.length < 2) throw new Error('Invalid CSV file format');
  
  const headers = parseCSVRow(rows[0]);
  const headerMap = {};
  headers.forEach((header, index) => {
    headerMap[header] = index;
  });
  
  // Initialize data structure (includes reminders)
  const importedData = {
    version: "2.1",
    exportDate: new Date().toISOString(),
    water: { goal: null, intake: null, history: {} },
    protein: { goal: null, intake: null, history: {} },
    workout: { types: [], state: {}, count: {}, history: {} },
    habits: { data: [] },
    reminders: { data: null },
    settings: { theme: null, reminder: null }
  };
  
  // Process each data row
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i].trim()) continue;
    
    const row = parseCSVRow(rows[i]);
    const dataType = row[headerMap.data_type];
    const key = row[headerMap.key];
    const value = row[headerMap.value];
    
    switch (dataType) {
      case 'meta':
        if (key === 'version') importedData.version = value;
        if (key === 'exportDate') importedData.exportDate = value;
        break;
        
      case 'water':
        if (key === 'goal') importedData.water.goal = value;
        if (key === 'intake') importedData.water.intake = value;
        break;
        
      case 'water_history':
        const waterDate = row[headerMap.date];
        const waterAmount = parseFloat(row[headerMap.amount]);
        const waterTimestamp = row[headerMap.timestamp];
        
        if (!importedData.water.history[waterDate]) {
          importedData.water.history[waterDate] = [];
        }
        importedData.water.history[waterDate].push({
          amount: waterAmount,
          timestamp: waterTimestamp
        });
        break;
        
      case 'protein':
        if (key === 'goal') importedData.protein.goal = value;
        if (key === 'intake') importedData.protein.intake = value;
        break;
        
      case 'protein_history':
        const proteinDate = row[headerMap.date];
        const proteinAmount = parseFloat(row[headerMap.amount]);
        const proteinTimestamp = row[headerMap.timestamp];
        
        if (!importedData.protein.history[proteinDate]) {
          importedData.protein.history[proteinDate] = [];
        }
        importedData.protein.history[proteinDate].push({
          amount: proteinAmount,
          timestamp: proteinTimestamp
        });
        break;
        
      case 'workout':
        if (key === 'types') importedData.workout.types = JSON.parse(value || '[]');
        if (key === 'state') importedData.workout.state = JSON.parse(value || '{}');
        if (key === 'count') importedData.workout.count = JSON.parse(value || '{}');
        break;
        
      case 'workout_history':
        const workoutDate = row[headerMap.date];
        const workoutType = row[headerMap.type];
        const workoutCount = parseInt(row[headerMap.count]) || 0;
        const workoutCompleted = row[headerMap.completed] === 'true';
        
        if (!importedData.workout.history[workoutDate]) {
          importedData.workout.history[workoutDate] = [];
        }
        importedData.workout.history[workoutDate].push({
          type: workoutType,
          count: workoutCount,
          completed: workoutCompleted
        });
        break;
        
      case 'habit':
        const habitName = row[headerMap.name];
        const habitColor = row[headerMap.color];
        
        importedData.habits.data.push({
          name: habitName,
          color: habitColor,
          history: {}
        });
        break;
        
      case 'habit_history':
        const habitKey = key.split('_')[0];
        const habitIndex = parseInt(habitKey);
        const habitDate = row[headerMap.date];
        const habitStatus = row[headerMap.value];
        
        if (importedData.habits.data[habitIndex]) {
          importedData.habits.data[habitIndex].history[habitDate] = habitStatus;
        }
        break;
        
      case 'reminders':
        if (key === 'data') importedData.reminders.data = value;
        break;
        
      case 'settings':
        if (key === 'theme') importedData.settings.theme = value;
        if (key === 'reminder') importedData.settings.reminder = value;
        break;
    }
  }
  
  return importedData;
}

/**
 * Parse a single CSV row, handling quoted values correctly
 */
function parseCSVRow(row) {
  const result = [];
  let insideQuotes = false;
  let currentValue = '';
  let i = 0;
  
  while (i < row.length) {
    const char = row[i];
    
    if (char === '"') {
      if (i + 1 < row.length && row[i + 1] === '"') {
        currentValue += '"';
        i += 2;
        continue;
      }
      
      insideQuotes = !insideQuotes;
      i++;
      continue;
    }
    
    if (char === ',' && !insideQuotes) {
      result.push(currentValue);
      currentValue = '';
      i++;
      continue;
    }
    
    currentValue += char;
    i++;
  }
  
  result.push(currentValue);
  return result;
}

/**
 * Apply imported data with reminders support
 */
function applyImportedData(data) {
  try {
    console.log('Applying imported data...');
    
    // Apply water data
    if (data.water) {
      if (data.water.goal) localStorage.setItem(STORAGE_KEYS.GOAL_PREFIX + 'water', data.water.goal);
      if (data.water.intake) localStorage.setItem(STORAGE_KEYS.INTAKE_PREFIX + 'water', data.water.intake);
      if (data.water.history) localStorage.setItem(STORAGE_KEYS.HISTORY_PREFIX + 'water', JSON.stringify(data.water.history));
    }
    
    // Apply protein data
    if (data.protein) {
      if (data.protein.goal) localStorage.setItem(STORAGE_KEYS.GOAL_PREFIX + 'protein', data.protein.goal);
      if (data.protein.intake) localStorage.setItem(STORAGE_KEYS.INTAKE_PREFIX + 'protein', data.protein.intake);
      if (data.protein.history) localStorage.setItem(STORAGE_KEYS.HISTORY_PREFIX + 'protein', JSON.stringify(data.protein.history));
    }
    
    // Apply workout data
    if (data.workout) {
      if (data.workout.types.length > 0) localStorage.setItem(STORAGE_KEYS.WORKOUT_TYPES, JSON.stringify(data.workout.types));
      if (Object.keys(data.workout.state).length > 0) localStorage.setItem(STORAGE_KEYS.WORKOUT_STATE, JSON.stringify(data.workout.state));
      if (Object.keys(data.workout.count).length > 0) localStorage.setItem(STORAGE_KEYS.WORKOUT_COUNT, JSON.stringify(data.workout.count));
      if (Object.keys(data.workout.history).length > 0) localStorage.setItem(STORAGE_KEYS.WORKOUT_HISTORY, JSON.stringify(data.workout.history));
    }
    
    // Apply habits data
    if (data.habits && data.habits.data.length > 0) {
      localStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(data.habits.data));
    }
    
    // Apply reminders data
    if (data.reminders && data.reminders.data) {
      localStorage.setItem('reminders_data', data.reminders.data);
    }
    
    // Apply settings
    if (data.settings) {
      if (data.settings.theme) localStorage.setItem(STORAGE_KEYS.THEME, data.settings.theme);
      if (data.settings.reminder) localStorage.setItem(STORAGE_KEYS.REMINDER, data.settings.reminder);
    }
    
    console.log('Data import completed successfully');
  } catch (error) {
    console.error('Error applying imported data:', error);
    throw error;
  }
}