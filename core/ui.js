/**
 * Health Tracker App - UI Initialization (UPDATED)
 * This file contains functions for initializing the UI components
 */

/**
 * Initialize theme (light/dark)
 */
function initializeTheme() {
  let savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);

  // If no theme saved, default to dark
  if (!savedTheme) {
    savedTheme = 'dark-theme';
    localStorage.setItem(STORAGE_KEYS.THEME, savedTheme);
  }

  document.body.classList.add(savedTheme);

  // Update theme-color meta tag based on theme
  const isDarkTheme = savedTheme === 'dark-theme';
  const themeColor = isDarkTheme ? '#121212' : '#F8F9FA';
  utils.changeThemeColor(themeColor);

  // Set up theme toggle button
  const themeToggleBtn = document.getElementById('toggle-theme');

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = document.body.classList.contains('dark-theme') ? 'dark-theme' : 'light-theme';
      const newTheme = currentTheme === 'dark-theme' ? 'light-theme' : 'dark-theme';

      document.body.classList.remove('dark-theme', 'light-theme');
      document.body.classList.add(newTheme);
      localStorage.setItem(STORAGE_KEYS.THEME, newTheme);

      const newColor = newTheme === 'dark-theme' ? '#121212' : '#F8F9FA';
      utils.changeThemeColor(newColor);
    });
  }
}

/**
 * Initialize tab navigation
 */
function initializeTabNavigation() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const appContainers = document.querySelectorAll('.app-container');
  
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const appType = btn.dataset.app;
      
      // Update button active state
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update visible app container
      appContainers.forEach(container => {
        container.classList.remove('active');
        if (container.id === `${appType}-app`) {
          container.classList.add('active');
        }
      });
      
      // Update theme-color meta tag
      // Only update with the app-specific color if not in a specific theme mode
      const isDarkTheme = document.body.classList.contains('dark-theme') || 
                        (!document.body.classList.contains('light-theme') && 
                         window.matchMedia('(prefers-color-scheme: dark)').matches);
      
      if (!isDarkTheme && !document.body.classList.contains('light-theme')) {
        utils.changeThemeColor(THEME_COLORS[appType]);
      }
    });
  });
  
  // Inner tab navigation in history popups
  document.querySelectorAll('.tab-button').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      const tabId = tabBtn.dataset.tab;
      const tabsContainer = tabBtn.closest('.panel');
      
      // Update active state for buttons
      tabsContainer.querySelectorAll('.tab-button').forEach(b => {
        b.classList.remove('active');
      });
      tabBtn.classList.add('active');
      
      // Show active tab content
      tabsContainer.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(tabId).classList.add('active');
    });
  });
  
  // Initialize history tabs
  document.getElementById('water-daily-history').classList.add('active');
  document.getElementById('protein-daily-history').classList.add('active');
  document.getElementById('workout-daily-history').classList.add('active');
}

/**
 * UPDATED: Initialize panels (settings, history, more options) - Updated for reminders
 */
function initializePanels() {
  console.log('Initializing panels with reminders support...');
  
  // UPDATED: Panel toggle buttons (removed notifications-settings-toggle)
  const panelToggles = {
    'water-settings-toggle': 'water-settings-section',
    'water-history-toggle': 'water-history-popup',
    'protein-settings-toggle': 'protein-settings-section',
    'protein-history-toggle': 'protein-history-popup',
    'workout-settings-toggle': 'workout-settings-section',
    'workout-history-toggle': 'workout-history-popup',
    'more-options-toggle': 'more-options-panel'
    // Note: reminders panel is handled by RemindersManager, not here
  };
  
  // Set up panel toggles
  Object.entries(panelToggles).forEach(([toggleId, panelId]) => {
    const toggleBtn = document.getElementById(toggleId);
    const panel = document.getElementById(panelId);
    
    if (toggleBtn && panel) {
      toggleBtn.addEventListener('click', () => {
        console.log(`Panel toggle clicked: ${toggleId} -> ${panelId}`);
        
        // UPDATED: Hide all other panels first (including reminders panel)
        document.querySelectorAll('.panel, .reminders-panel').forEach(p => {
          if (p.id !== panelId) {
            p.classList.remove('active');
          }
        });
        
        // Toggle this panel
        panel.classList.toggle('active');
      });
    } else {
      console.warn(`Panel toggle missing: ${toggleId} or ${panelId}`);
    }
  });
  
  // Close panel buttons
  document.querySelectorAll('.close-panel').forEach(closeBtn => {
    closeBtn.addEventListener('click', () => {
      console.log('Close panel button clicked');
      const panel = closeBtn.closest('.panel, .reminders-panel');
      if (panel) {
        panel.classList.remove('active');
      }
    });
  });
  
  // UPDATED: Close panels when clicking outside - improved to handle reminders panel
  document.addEventListener('click', (event) => {
    // Check if clicked element or its ancestors are panels or toggle buttons
    const isPanel = !!event.target.closest('.panel, .reminders-panel');
    const isToggle = !!event.target.closest('[id$="-toggle"], #reminders-bell-icon');
    const isTogglePressed = Object.keys(panelToggles).some(id => 
      event.target.closest(`#${id}`) !== null
    );
    
    // UPDATED: Also check for reminders bell icon specifically
    const isRemindersBell = !!event.target.closest('#reminders-bell-icon');
    
    // Only close panels if clicked outside any panel and toggle button
    if (!isPanel && !isToggle && !isTogglePressed && !isRemindersBell) {
      console.log('Clicking outside panels - closing all panels');
      document.querySelectorAll('.panel, .reminders-panel').forEach(panel => {
        panel.classList.remove('active');
      });
    }
  }, true);
  
  console.log('Panels initialization complete');
}

/**
 * UPDATED: Initialize tracker actions for a specific tracker
 * @param {Tracker} tracker - Tracker instance
 */
function initializeTrackerActions(tracker) {
  const type = tracker.type;
  
  // Set up quick add buttons
  document.querySelectorAll(`[data-action="${type}-add"]`).forEach(btn => {
    btn.addEventListener('click', () => {
      const amount = parseInt(btn.dataset.amount);
      if (!isNaN(amount) && amount > 0) {
        tracker.addIntake(amount);
      }
    });
  });
  
  // Set up manual add button
  const addManualBtn = document.getElementById(`${type}-add-manual`);
  if (addManualBtn) {
    addManualBtn.addEventListener('click', () => {
      tracker.addManualIntake();
    });
  }
  
  // Set up enter key for manual input
  const manualInput = document.getElementById(`${type}-manual`);
  if (manualInput) {
    manualInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') {
        tracker.addManualIntake();
      }
    });
  }
  
  // Set goal button
  const setGoalBtn = document.getElementById(`${type}-set-goal`);
  if (setGoalBtn) {
    setGoalBtn.addEventListener('click', () => {
      tracker.setGoal();
    });
  }
  
  // Reset daily button
  const resetDailyBtn = document.getElementById(`${type}-reset-daily`);
  if (resetDailyBtn) {
    resetDailyBtn.addEventListener('click', () => {
      if (confirm(`Are you sure you want to reset today's ${type} intake data?`)) {
        tracker.resetDailyIntake();
        utils.showToast(`Today's ${type} intake has been reset.`, 'warning');
      }
    });
  }
  
  // Reset all data button
  const resetDataBtn = document.getElementById(`${type}-reset-data`);
  if (resetDataBtn) {
    resetDataBtn.addEventListener('click', () => {
      if (confirm(`⚠️ WARNING: This will delete ALL ${type} tracking data. This action cannot be undone. Are you sure?`)) {
        tracker.resetAllData();
      }
    });
  }
  
  // NEW: Goal Reminder Button
  const goalReminderBtn = document.getElementById(`${type}-goal-reminder-btn`);
  if (goalReminderBtn) {
    goalReminderBtn.addEventListener('click', () => {
      toggleGoalReminderButton(type);
    });
  }
  
  // NEW: Interval Reminder Button (only for water)
  if (type === 'water') {
    const intervalReminderBtn = document.getElementById(`${type}-interval-reminder-btn`);
    if (intervalReminderBtn) {
      intervalReminderBtn.addEventListener('click', () => {
        toggleIntervalReminderButton(type);
      });
    }
  }
  
  // NEW: More Options Button
  const moreOptionsBtn = document.getElementById(`${type}-more-options-btn`);
  if (moreOptionsBtn) {
    moreOptionsBtn.addEventListener('click', () => {
      openRemindersPanelForTracker(type);
    });
  }
  
  // Initialize button states
  updateNotificationButtonStates(type);
  
  // Initial history refresh
  tracker.refreshHistory();
}

/**
 * NEW: Toggle goal reminder button state
 */
function toggleGoalReminderButton(type) {
  if (!window.remindersManager) {
    utils.showToast('Reminders system not available', 'error');
    return;
  }
  
  const reminderType = type === 'water' ? 'waterAlert' : 'proteinAlert';
  const currentState = window.remindersManager.data.systemNotifications[reminderType]?.enabled || false;
  const newState = !currentState;
  
  if (newState && !window.remindersManager.data.globalEnabled) {
    // Enable global reminders first
    window.remindersManager.requestNotificationPermission().then(() => {
      if (window.remindersManager.data.globalEnabled) {
        setupGoalAlert(type, true);
        updateNotificationButtonStates(type);
      }
    });
  } else {
    setupGoalAlert(type, newState);
    updateNotificationButtonStates(type);
  }
}

/**
 * NEW: Toggle interval reminder button state (water only)
 */
function toggleIntervalReminderButton(type) {
  if (!window.remindersManager) {
    utils.showToast('Reminders system not available', 'error');
    return;
  }
  
  const reminderType = type === 'water' ? 'waterInterval' : 'proteinInterval';
  const currentState = window.remindersManager.data.systemNotifications[reminderType]?.enabled || false;
  const newState = !currentState;
  
  if (newState && !window.remindersManager.data.globalEnabled) {
    // Enable global reminders first
    window.remindersManager.requestNotificationPermission().then(() => {
      if (window.remindersManager.data.globalEnabled) {
        setupIntervalReminder(type, true);
        updateNotificationButtonStates(type);
      }
    });
  } else {
    setupIntervalReminder(type, newState);
    updateNotificationButtonStates(type);
  }
}

/**
 * NEW: Open reminders panel for specific tracker
 */
function openRemindersPanelForTracker(type) {
  if (!window.remindersManager) {
    utils.showToast('Reminders system not available', 'error');
    return;
  }
  
  // Close current settings panel
  const settingsPanel = document.getElementById(`${type}-settings-section`);
  if (settingsPanel) {
    settingsPanel.classList.remove('active');
  }
  
  // Open reminders panel and navigate to system reminders
  window.remindersManager.openPanel();
  
  // After a short delay, navigate to system reminders view
  setTimeout(() => {
    window.remindersManager.showSystemReminders();
  }, 100);
}

/**
 * NEW: Update notification button states based on current settings
 */
function updateNotificationButtonStates(type) {
  if (!window.remindersManager) return;
  
  // Update goal reminder button
  const goalBtn = document.getElementById(`${type}-goal-reminder-btn`);
  const goalStatus = document.getElementById(`${type}-goal-status`);
  if (goalBtn && goalStatus) {
    const reminderType = type === 'water' ? 'waterAlert' : 'proteinAlert';
    const isEnabled = window.remindersManager.data.systemNotifications[reminderType]?.enabled || false;
    
    if (isEnabled) {
      goalBtn.classList.add('active');
      goalStatus.textContent = 'ON';
    } else {
      goalBtn.classList.remove('active');
      goalStatus.textContent = 'OFF';
    }
  }
  
  // Update interval reminder button (water only)
  if (type === 'water') {
    const intervalBtn = document.getElementById(`${type}-interval-reminder-btn`);
    const intervalStatus = document.getElementById(`${type}-interval-status`);
    if (intervalBtn && intervalStatus) {
      const reminderType = 'waterInterval';
      const isEnabled = window.remindersManager.data.systemNotifications[reminderType]?.enabled || false;
      
      if (isEnabled) {
        intervalBtn.classList.add('active');
        intervalStatus.textContent = 'ON';
      } else {
        intervalBtn.classList.remove('active');
        intervalStatus.textContent = 'OFF';
      }
    }
  }
}

/**
 * UPDATED: Setup goal alert reminder (updated to refresh button states)
 */
function setupGoalAlert(type, enable) {
  const reminderType = type === 'water' ? 'waterAlert' : 'proteinAlert';
  const reminderTitle = type === 'water' ? 'Water Goal Alert' : 'Protein Goal Alert';
  
  // Ensure the notification type exists
  if (!window.remindersManager.data.systemNotifications[reminderType]) {
    window.remindersManager.data.systemNotifications[reminderType] = {
      enabled: enable,
      time: "20:00",
      days: [1, 2, 3, 4, 5, 6, 0],
      onlyIfGoalNotMet: true,
      message: `Don't forget your daily ${type} goal!`
    };
  } else {
    window.remindersManager.data.systemNotifications[reminderType].enabled = enable;
  }
  
  window.remindersManager.saveData();
  window.remindersManager.scheduleAllReminders();
  
  const action = enable ? 'enabled' : 'disabled';
  const time = window.remindersManager.data.systemNotifications[reminderType].time;
  utils.showToast(`${reminderTitle} ${action} (${time})`, enable ? 'success' : 'info');
}

/**
 * UPDATED: Setup interval reminder (updated to refresh button states)
 */
function setupIntervalReminder(type, enable) {
  const reminderType = type === 'water' ? 'waterInterval' : 'proteinInterval';
  const reminderTitle = type === 'water' ? 'Water Interval Reminders' : 'Protein Interval Reminders';
  
  // Ensure the notification type exists
  if (!window.remindersManager.data.systemNotifications[reminderType]) {
    window.remindersManager.data.systemNotifications[reminderType] = {
      enabled: enable,
      interval: 120, // 2 hours default
      activeWindow: { start: "08:00", end: "22:00" },
      days: [1, 2, 3, 4, 5, 6, 0],
      onlyIfBelowGoal: true,
      message: `Time to drink ${type}!`
    };
  } else {
    window.remindersManager.data.systemNotifications[reminderType].enabled = enable;
  }
  
  window.remindersManager.saveData();
  window.remindersManager.scheduleAllReminders();
  
  const action = enable ? 'enabled' : 'disabled';
  const interval = window.remindersManager.data.systemNotifications[reminderType].interval;
  utils.showToast(`${reminderTitle} ${action} (every ${interval} minutes)`, enable ? 'success' : 'info');
}

/**
 * NEW: Initialize settings panel events to update button states when panels are opened
 */
function initializeSettingsPanelEvents() {
  // Update button states when settings panels are opened
  const waterSettingsBtn = document.getElementById('water-settings-toggle');
  const proteinSettingsBtn = document.getElementById('protein-settings-toggle');
  
  if (waterSettingsBtn) {
    waterSettingsBtn.addEventListener('click', () => {
      setTimeout(() => updateNotificationButtonStates('water'), 100);
    });
  }
  
  if (proteinSettingsBtn) {
    proteinSettingsBtn.addEventListener('click', () => {
      setTimeout(() => updateNotificationButtonStates('protein'), 100);
    });
  }
}

/**
 * Initialize workout tracker actions - UPDATED VERSION
 * @param {WorkoutTracker} tracker - WorkoutTracker instance
 */
function initializeWorkoutTrackerActions(tracker) {
  // Reset tabs only button
  const resetTabsBtn = document.getElementById('workout-reset-tabs');
  if (resetTabsBtn) {
    resetTabsBtn.addEventListener('click', () => {
      tracker.resetWorkoutTabs();
      utils.showToast('Workout tabs have been reset.', 'warning');
      
      // Close the settings panel
      document.getElementById('workout-settings-section').classList.remove('active');
    });
  }
  
  // Reset daily button
  const resetDailyBtn = document.getElementById('workout-reset-daily');
  if (resetDailyBtn) {
    resetDailyBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset today\'s workout data? This will clear both the tabs and today\'s history.')) {
        tracker.resetDailyWorkouts();
        utils.showToast('Today\'s workout data has been reset.', 'warning');
      }
    });
  }
  
  // Reset all data button
  const resetDataBtn = document.getElementById('workout-reset-data');
  if (resetDataBtn) {
    resetDataBtn.addEventListener('click', () => {
      if (confirm('⚠️ WARNING: This will delete ALL workout tracking data. This action cannot be undone. Are you sure?')) {
        tracker.resetAllData();
      }
    });
  }

  // Manage workouts button
  const manageBtn = document.getElementById('workout-manage-button');
  if (manageBtn) {
    manageBtn.addEventListener('click', () => {
      tracker.showManageModal();
    });
  }

  // Add workout button in modal
  const addWorkoutBtn = document.getElementById('add-workout-btn');
  if (addWorkoutBtn) {
    addWorkoutBtn.addEventListener('click', () => {
      tracker.addNewWorkout();
    });
  }

  // Cancel button in manage modal
  const manageCancelBtn = document.getElementById('workout-manage-cancel');
  if (manageCancelBtn) {
    manageCancelBtn.addEventListener('click', () => {
      tracker.hideManageModal();
    });
  }

  // Handle enter key in new workout input
  const newWorkoutInput = document.getElementById('new-workout-input');
  if (newWorkoutInput) {
    newWorkoutInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        tracker.addNewWorkout();
      }
    });
  }

  // Close modal when clicking backdrop
  const manageModal = document.getElementById('workout-manage-modal');
  if (manageModal) {
    manageModal.addEventListener('click', (e) => {
      if (e.target === manageModal) {
        tracker.hideManageModal();
      }
    });
  }
  
  // Initial history refresh
  tracker.refreshHistory();
}