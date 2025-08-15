/**
 * Health Tracker App - Reminders Management System (UPDATED WITH SERVER NOTIFICATIONS)
 * 
 * FEATURES:
 * - Goal alerts without time windows (daily check only)
 * - Interval reminders with active hours only
 * - Multiple times support for custom reminders
 * - Manual expansion for system notifications
 * - Inline toggles for custom reminders
 * - SERVER NOTIFICATIONS: Background push notifications via Pi server
 */

class RemindersManager {
  constructor() {
    // Configuration
    this.remindersKey = 'reminders_data';
    this.currentView = 'main';
    this.editingReminderId = null;
    this.activeTimers = new Map();
    this.intervalTimers = new Map();
    
    // Track expansion state of system notifications
    this.expandedSystemNotifications = new Set();
    
    // NEW: Server notification properties
    this.serverUrl = 'https://192.168.0.147'; // Your Pi's IP
    this.userId = this.generateUserId();
    this.pushSubscription = null;
    this.pushNotificationsEnabled = false;
    this.serverConnectionStatus = 'disconnected'; // 'connected', 'disconnected', 'connecting', 'error'
    this.lastServerTest = null;
    
    // Legacy notification keys for migration
    this.legacyNotificationKeys = {
      global: 'notifications_enabled',
      waterAlert: 'notification_water',
      waterInterval: 'notification_water_interval_enabled',
      proteinAlert: 'notification_protein'
    };
    
    // Default data structure - only 4 specific notification types
    this.defaultData = {
      globalEnabled: false,
      systemNotifications: {
        waterAlert: {
          enabled: false,
          time: "20:00",
          days: [],
          onlyIfGoalNotMet: true,
          message: "Don't forget your daily water goal!"
        },
        waterInterval: {
          enabled: false,
          interval: 120,
          activeWindow: { start: "08:00", end: "22:00" },
          days: [],
          onlyIfBelowGoal: true,
          message: "Time to drink water!"
        },
        proteinAlert: {
          enabled: false,
          time: "20:00",
          days: [],
          onlyIfGoalNotMet: true,
          message: "Check your protein intake for today"
        },
        proteinInterval: {
          enabled: false,
          interval: 120,
          activeWindow: { start: "08:00", end: "22:00" },
          days: [],
          onlyIfBelowGoal: true,
          message: "Time to get your protein!"
        }
      },
      customReminders: []
    };
    
    // Initialize elements
    this.elements = {
      remindersPanel: document.getElementById('reminders-panel'),
      bellIcon: document.getElementById('reminders-bell-icon'),
      globalToggle: null
    };
    
    // Initialize
    this.loadData();
    this.migrateLegacyNotifications();
    this.init();
    
    // NEW: Initialize server notifications
    this.setupPushNotifications();
  }

  // NEW: Generate simple user ID
  generateUserId() {
    let userId = localStorage.getItem('health_tracker_user_id');
    if (!userId) {
      userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('health_tracker_user_id', userId);
    }
    return userId;
  }

  async setupPushNotifications() {
  console.log('🔄 [DEBUG] Starting push notification setup...');
  console.log('🔄 [DEBUG] Server URL:', this.serverUrl);
  console.log('🔄 [DEBUG] User ID:', this.userId);
  
  try {
    // Update status to connecting
    this.serverConnectionStatus = 'connecting';
    console.log('🔄 [DEBUG] Status set to connecting');

    // Check browser support
    if (!('serviceWorker' in navigator)) {
      console.error('❌ [DEBUG] Service worker not supported');
      this.serverConnectionStatus = 'error';
      return;
    }
    
    if (!('PushManager' in window)) {
      console.error('❌ [DEBUG] Push manager not supported');
      this.serverConnectionStatus = 'error';
      return;
    }
    
    console.log('✅ [DEBUG] Browser supports push notifications');

    // Check service worker
    console.log('🔄 [DEBUG] Waiting for service worker...');
    const registration = await navigator.serviceWorker.ready;
    console.log('✅ [DEBUG] Service worker ready:', registration);

    // Check permission
    let permission = Notification.permission;
    console.log('🔔 [DEBUG] Current permission:', permission);
    
    if (permission === 'default') {
      console.log('🔔 [DEBUG] Requesting permission...');
      permission = await Notification.requestPermission();
      console.log('🔔 [DEBUG] Permission after request:', permission);
    }
    
    if (permission !== 'granted') {
      console.error('❌ [DEBUG] Notification permission denied');
      this.serverConnectionStatus = 'error';
      return;
    }

    // Test server health
    console.log('🌐 [DEBUG] Testing server health...');
    const healthResponse = await fetch(`${this.serverUrl}/health`);
    console.log('📡 [DEBUG] Health response status:', healthResponse.status);
    console.log('📡 [DEBUG] Health response ok:', healthResponse.ok);
    
    if (!healthResponse.ok) {
      throw new Error(`Health check failed: ${healthResponse.status}`);
    }
    
    const healthData = await healthResponse.json();
    console.log('✅ [DEBUG] Server health data:', healthData);

    // Get VAPID key
    console.log('🔑 [DEBUG] Getting VAPID key...');
    const vapidResponse = await fetch(`${this.serverUrl}/vapid-public-key`);
    console.log('🔑 [DEBUG] VAPID response status:', vapidResponse.status);
    console.log('🔑 [DEBUG] VAPID response ok:', vapidResponse.ok);
    
    if (!vapidResponse.ok) {
      throw new Error(`VAPID failed: ${vapidResponse.status} ${vapidResponse.statusText}`);
    }
    
    const { publicKey } = await vapidResponse.json();
    console.log('✅ [DEBUG] VAPID public key received (first 20 chars):', publicKey.substring(0, 20));

    // Subscribe to push notifications
    console.log('📝 [DEBUG] Creating push subscription...');
    this.pushSubscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: this.urlBase64ToUint8Array(publicKey)
    });
    console.log('✅ [DEBUG] Push subscription created:', !!this.pushSubscription);

    // Send subscription to server
    console.log('📤 [DEBUG] Sending subscription to server...');
    const subscribeResponse = await fetch(`${this.serverUrl}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: this.pushSubscription,
        userId: this.userId
      })
    });

    console.log('📤 [DEBUG] Subscribe response status:', subscribeResponse.status);
    console.log('📤 [DEBUG] Subscribe response ok:', subscribeResponse.ok);

    if (!subscribeResponse.ok) {
      const errorText = await subscribeResponse.text();
      throw new Error(`Failed to subscribe: ${subscribeResponse.status} ${errorText}`);
    }

    const subscribeData = await subscribeResponse.json();
    console.log('✅ [DEBUG] Subscription response:', subscribeData);

    console.log('🎉 [DEBUG] Push notifications setup complete!');
    this.pushNotificationsEnabled = true;
    this.serverConnectionStatus = 'connected';
    this.lastServerTest = new Date();

  } catch (error) {
    console.error('❌ [DEBUG] Push notification setup failed:', error);
    console.error('❌ [DEBUG] Error message:', error.message);
    console.error('❌ [DEBUG] Error stack:', error.stack);
    this.pushNotificationsEnabled = false;
    this.serverConnectionStatus = 'error';
  }
}

  // NEW: Send notification via server
  async sendServerNotification(title, body, data = {}) {
    if (!this.pushNotificationsEnabled) return;

    try {
      const response = await fetch(`${this.serverUrl}/send-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          title,
          body,
          data
        })
      });

      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }

      console.log('✅ Server notification sent successfully');
      return true;
    } catch (error) {
      console.error('Failed to send server notification:', error);
      return false;
    }
  }

  // NEW: Test server connection
  async testServerConnection() {
    try {
      this.serverConnectionStatus = 'connecting';
      
      const response = await fetch(`${this.serverUrl}/health`);
      if (!response.ok) {
        throw new Error('Server health check failed');
      }
      
      const healthData = await response.json();
      this.serverConnectionStatus = 'connected';
      this.lastServerTest = new Date();
      
      return {
        success: true,
        data: healthData
      };
    } catch (error) {
      console.error('Server connection test failed:', error);
      this.serverConnectionStatus = 'error';
      return {
        success: false,
        error: error.message
      };
    }
  }

  // NEW: Send test notification
  async sendTestNotification() {
    const success = await this.sendServerNotification(
      '🧪 Test Notification',
      'If you see this, server notifications are working perfectly!',
      { type: 'test', timestamp: Date.now() }
    );
    
    if (success) {
      utils.showToast('Test notification sent successfully!', 'success');
    } else {
      utils.showToast('Failed to send test notification', 'error');
    }
    
    return success;
  }

  // NEW: Get server connection status with details
  getServerStatus() {
    return {
      status: this.serverConnectionStatus,
      connected: this.pushNotificationsEnabled,
      userId: this.userId,
      serverUrl: this.serverUrl,
      lastTest: this.lastServerTest,
      subscription: !!this.pushSubscription
    };
  }

  // NEW: Helper function for VAPID key conversion
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
  
  /**
   * Initialize the reminders system
   */
  init() {
    console.log('Initializing RemindersManager...');
    
    if (!this.elements.remindersPanel || !this.elements.bellIcon) {
      console.error('Required elements not found');
      return;
    }
    
    // Set up bell icon click handler
    this.elements.bellIcon.addEventListener('click', () => {
      console.log('Bell icon clicked');
      this.togglePanel();
    });
    
    // Initial render
    this.renderPanel();
    
    // Start all active reminders
    this.startAllReminders();
    
    console.log('RemindersManager initialized successfully');
  }
  
  /**
   * Load data from localStorage
   */
  loadData() {
    try {
      const saved = localStorage.getItem(this.remindersKey);
      if (saved) {
        this.data = { ...this.defaultData, ...JSON.parse(saved) };
        // Ensure all required properties exist
        this.data.systemNotifications = { ...this.defaultData.systemNotifications, ...this.data.systemNotifications };
      } else {
        this.data = { ...this.defaultData };
      }
    } catch (error) {
      console.error('Failed to load reminders data:', error);
      this.data = { ...this.defaultData };
    }
    
    console.log('Loaded reminders data:', this.data);
  }
  
  /**
   * Save data to localStorage
   */
  saveData() {
    try {
      localStorage.setItem(this.remindersKey, JSON.stringify(this.data));
      console.log('Reminders data saved');
    } catch (error) {
      console.error('Failed to save reminders data:', error);
    }
  }
  
  /**
   * Migrate legacy notification settings
   */
  migrateLegacyNotifications() {
    let migrated = false;
    
    // Check if we have legacy data
    Object.entries(this.legacyNotificationKeys).forEach(([key, legacyKey]) => {
      const legacyValue = localStorage.getItem(legacyKey);
      if (legacyValue !== null) {
        console.log(`Migrating legacy notification: ${legacyKey} -> ${key}`);
        
        if (key === 'global') {
          this.data.globalEnabled = legacyValue === 'true';
        } else if (this.data.systemNotifications[key]) {
          this.data.systemNotifications[key].enabled = legacyValue === 'true';
        }
        
        // Remove legacy key
        localStorage.removeItem(legacyKey);
        migrated = true;
      }
    });
    
    if (migrated) {
      this.saveData();
      console.log('Legacy notifications migrated successfully');
    }
  }
  
  /**
   * Toggle reminders panel
   */
  togglePanel() {
    const isActive = this.elements.remindersPanel.classList.contains('active');
    if (isActive) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }
  
  /**
   * Open reminders panel
   */
  openPanel() {
    console.log('Opening reminders panel');
    
    // Close any other open panels
    document.querySelectorAll('.panel').forEach(panel => {
      panel.classList.remove('active');
    });
    
    this.elements.remindersPanel.classList.add('active');
    this.renderPanel();
  }
  
  /**
   * Close reminders panel
   */
  closePanel() {
    console.log('Closing reminders panel');
    this.elements.remindersPanel.classList.remove('active');
    this.currentView = 'main';
  }
  
  /**
   * Back to main view
   */
  backToMain() {
    this.currentView = 'main';
    this.editingReminderId = null;
    this.renderPanel();
  }
  
  /**
   * Show system reminders view
   */
  showSystemReminders() {
    this.currentView = 'system';
    this.renderPanel();
  }

  // NEW: Show server settings
  showServerSettings() {
    this.currentView = 'server-settings';
    this.renderPanel();
  }
  
  /**
   * Request notification permission
   */
  async requestNotificationPermission() {
    try {
      if (!('Notification' in window)) {
        utils.showToast('This browser does not support notifications', 'error');
        return false;
      }
      
      let permission = Notification.permission;
      
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }
      
      if (permission === 'granted') {
        this.data.globalEnabled = true;
        this.saveData();
        this.startAllReminders();
        utils.showToast('Notifications enabled successfully!', 'success');
        return true;
      } else {
        utils.showToast('Notification permission denied', 'error');
        return false;
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      utils.showToast('Failed to enable notifications', 'error');
      return false;
    }
  }
  
  /**
   * Render the entire reminders panel based on current view
   */
  renderPanel() {
    if (!this.elements.remindersPanel) {
      console.error('Reminders panel not found');
      return;
    }
    
    console.log('Rendering panel, current view:', this.currentView);
    
    switch (this.currentView) {
      case 'main':
        this.renderMainView();
        break;
      case 'system':
        this.renderSystemRemindersView();
        break;
      case 'server-settings':
        this.renderServerSettingsView();
        break;
      case 'add-custom':
        this.renderCustomReminderModal(false);
        break;
      case 'edit-custom':
        this.renderCustomReminderModal(true);
        break;
      default:
        this.renderMainView();
    }
    
    // Attach event listeners
    this.attachPanelEventListeners();
  }
  
  /**
   * UPDATED: Render main reminders view with server settings button
   */
  renderMainView() {
    const html = `
      <div class="panel-header">
        <h3>🔔 Reminders</h3>
        <div class="header-actions">
          <button class="icon-btn server-settings-btn" id="server-settings-btn" aria-label="Server Settings">
            <i class="material-icons-round">cloud</i>
          </button>
          <button class="close-panel icon-btn" aria-label="Close">
            <i class="material-icons-round">close</i>
          </button>
        </div>
      </div>
      
      <!-- Global Toggle Section -->
      <div class="global-reminders-section">
        <div class="global-reminders-header">
          <div class="global-reminders-title">
            <i class="material-icons-round">notifications</i>
            Enable Reminders
          </div>
          <label class="reminder-toggle-switch">
            <input type="checkbox" id="global-reminders-toggle" ${this.data.globalEnabled ? 'checked' : ''}>
            <span class="reminder-toggle-slider"></span>
          </label>
        </div>
      </div>
      
      <!-- System Reminders Button -->
      <div class="reminders-category">
        <button class="system-reminders-btn" id="system-reminders-btn">
          <div class="system-reminders-info">
            <i class="material-icons-round">settings</i>
            <div class="system-reminders-text">
              <span class="system-reminders-title">System Reminders</span>
              <span class="system-reminders-count">${this.getActiveSystemRemindersCount()} active</span>
            </div>
          </div>
          <i class="material-icons-round">chevron_right</i>
        </button>
      </div>
      
      <!-- Custom Reminders Section -->
      <div class="reminders-category">
        <div class="reminders-category-header">
          <h4>Custom Reminders</h4>
          <span class="reminders-count">${this.data.customReminders.length}</span>
        </div>
        
        ${this.renderCustomRemindersList()}
        
        <button class="add-reminder-btn" id="add-custom-reminder">
          <i class="material-icons-round">add</i>
          Add Reminder
        </button>
      </div>
    `;
    
    this.elements.remindersPanel.innerHTML = html;
  }

  // NEW: Render server settings view
  renderServerSettingsView() {
    const serverStatus = this.getServerStatus();
    const statusIcon = {
      'connected': { icon: 'cloud_done', color: '#4CAF50', text: 'Connected' },
      'connecting': { icon: 'cloud_sync', color: '#FF9800', text: 'Connecting...' },
      'disconnected': { icon: 'cloud_off', color: '#757575', text: 'Disconnected' },
      'error': { icon: 'cloud_off', color: '#F44336', text: 'Connection Error' }
    }[serverStatus.status];

    const html = `
      <div class="panel-header">
        <button class="back-btn icon-btn" id="back-to-main" aria-label="Back">
          <i class="material-icons-round">arrow_back</i>
        </button>
        <h3>☁️ Server Settings</h3>
        <button class="close-panel icon-btn" aria-label="Close">
          <i class="material-icons-round">close</i>
        </button>
      </div>

      <!-- Server Connection Status -->
      <div class="server-status-section">
        <div class="server-status-card">
          <div class="server-status-header">
            <div class="server-status-icon" style="color: ${statusIcon.color}">
              <i class="material-icons-round">${statusIcon.icon}</i>
            </div>
            <div class="server-status-info">
              <div class="server-status-title">Push Notifications Server</div>
              <div class="server-status-text" style="color: ${statusIcon.color}">
                ${statusIcon.text}
              </div>
            </div>
            <button class="icon-btn refresh-connection-btn" id="refresh-connection-btn" 
                    ${serverStatus.status === 'connecting' ? 'disabled' : ''}>
              <i class="material-icons-round">refresh</i>
            </button>
          </div>
          
          <div class="server-details">
            <div class="server-detail-item">
              <span class="detail-label">Server URL:</span>
              <span class="detail-value">${serverStatus.serverUrl}</span>
            </div>
            <div class="server-detail-item">
              <span class="detail-label">User ID:</span>
              <span class="detail-value">${serverStatus.userId}</span>
            </div>
            <div class="server-detail-item">
              <span class="detail-label">Push Subscription:</span>
              <span class="detail-value">${serverStatus.subscription ? '✅ Active' : '❌ None'}</span>
            </div>
            ${serverStatus.lastTest ? `
              <div class="server-detail-item">
                <span class="detail-label">Last Test:</span>
                <span class="detail-value">${new Date(serverStatus.lastTest).toLocaleString()}</span>
              </div>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- Server Actions -->
      <div class="server-actions-section">
        <div class="server-actions-header">
          <h4>Server Actions</h4>
        </div>
        
        <div class="server-action-buttons">
          <button class="server-action-btn test-connection" id="test-connection-btn"
                  ${serverStatus.status === 'connecting' ? 'disabled' : ''}>
            <div class="action-btn-content">
              <i class="material-icons-round">network_check</i>
              <div class="action-btn-text">
                <span class="action-btn-title">Test Connection</span>
                <span class="action-btn-subtitle">Check server health status</span>
              </div>
            </div>
          </button>
          
          <button class="server-action-btn test-notification" id="test-notification-btn"
                  ${!serverStatus.connected ? 'disabled' : ''}>
            <div class="action-btn-content">
              <i class="material-icons-round">notification_add</i>
              <div class="action-btn-text">
                <span class="action-btn-title">Send Test Notification</span>
                <span class="action-btn-subtitle">Test push notification delivery</span>
              </div>
            </div>
          </button>
          
          <button class="server-action-btn reconnect" id="reconnect-server-btn"
                  ${serverStatus.status === 'connecting' ? 'disabled' : ''}>
            <div class="action-btn-content">
              <i class="material-icons-round">sync</i>
              <div class="action-btn-text">
                <span class="action-btn-title">Reconnect to Server</span>
                <span class="action-btn-subtitle">Re-establish push notification connection</span>
              </div>
            </div>
          </button>
        </div>
      </div>

      <!-- Server Info -->
      <div class="server-info-section">
        <div class="server-info-header">
          <h4>How Server Notifications Work</h4>
        </div>
        <div class="server-info-content">
          <div class="info-item">
            <i class="material-icons-round info-icon">info</i>
            <div class="info-text">
              <strong>Local + Server:</strong> Your reminders trigger locally and also send notifications through the server for background delivery.
            </div>
          </div>
          <div class="info-item">
            <i class="material-icons-round info-icon">phone_iphone</i>
            <div class="info-text">
              <strong>Background Notifications:</strong> Server notifications work even when the app is closed or your device is asleep.
            </div>
          </div>
          <div class="info-item">
            <i class="material-icons-round info-icon">security</i>
            <div class="info-text">
              <strong>Privacy:</strong> Only reminder notifications are sent. No personal data is transmitted to the server.
            </div>
          </div>
        </div>
      </div>
    `;
    
    this.elements.remindersPanel.innerHTML = html;
  }
  
  /**
   * Render system reminders view
   */
  renderSystemRemindersView() {
    const html = `
      <div class="panel-header">
        <button class="back-btn icon-btn" id="back-to-main" aria-label="Back">
          <i class="material-icons-round">arrow_back</i>
        </button>
        <h3>⚙️ System Reminders</h3>
        <button class="close-panel icon-btn" aria-label="Close">
          <i class="material-icons-round">close</i>
        </button>
      </div>
      
      <div class="system-notifications-container">
        ${this.renderSystemNotificationCard('waterAlert', 'Water Goal Alert', 'drop_water', 'Check your daily water goal progress')}
        ${this.renderSystemNotificationCard('waterInterval', 'Water Interval Reminder', 'schedule', 'Regular water intake reminders')}
        ${this.renderSystemNotificationCard('proteinAlert', 'Protein Goal Alert', 'fitness_center', 'Check your daily protein goal progress')}
        ${this.renderSystemNotificationCard('proteinInterval', 'Protein Interval Reminder', 'timer', 'Regular protein intake reminders')}
      </div>
    `;
    
    this.elements.remindersPanel.innerHTML = html;
  }
  
  /**
   * Render custom reminder modal (add/edit)
   */
  renderCustomReminderModal(isEdit = false) {
    const reminder = isEdit ? this.data.customReminders.find(r => r.id === this.editingReminderId) : null;
    const title = isEdit ? 'Edit Reminder' : 'Add Custom Reminder';
    
    const html = `
      <div class="panel-header">
        <button class="back-btn icon-btn" id="back-to-main" aria-label="Back">
          <i class="material-icons-round">arrow_back</i>
        </button>
        <h3>${title}</h3>
        <button class="close-panel icon-btn" aria-label="Close">
          <i class="material-icons-round">close</i>
        </button>
      </div>
      
      <form class="custom-reminder-form" id="custom-reminder-form">
        <div class="form-group">
          <label class="form-label" for="reminder-title-input">Reminder Title</label>
          <input type="text" id="reminder-title-input" class="reminder-title-input" 
                 placeholder="Enter reminder title..." value="${reminder ? reminder.title : ''}" required>
        </div>
        
        <div class="form-group">
          <label class="form-label">Reminder Type</label>
          <div class="reminder-type-tabs">
            <button type="button" class="reminder-type-tab ${!reminder || reminder.type === 'single' ? 'active' : ''}" 
                    data-type="single">
              <i class="material-icons-round">event</i>
              <span>Single Time</span>
            </button>
            <button type="button" class="reminder-type-tab ${reminder && reminder.type === 'recurring' ? 'active' : ''}" 
                    data-type="recurring">
              <i class="material-icons-round">repeat</i>
              <span>Recurring</span>
            </button>
            <button type="button" class="reminder-type-tab ${reminder && reminder.type === 'multiple' ? 'active' : ''}" 
                    data-type="multiple">
              <i class="material-icons-round">schedule</i>
              <span>Multiple Times</span>
            </button>
          </div>
        </div>
        
        <!-- Single Time Fields -->
        <div class="reminder-type-fields" data-type="single" ${!reminder || reminder.type === 'single' ? '' : 'style="display: none;"'}>
          <div class="form-group">
            <label class="form-label" for="reminder-date-input">Date</label>
            <input type="date" id="reminder-date-input" class="reminder-date-input" 
                   value="${reminder && reminder.type === 'single' ? reminder.date : ''}" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="reminder-time-input">Time</label>
            <input type="time" id="reminder-time-input" class="reminder-time-input" 
                   value="${reminder && reminder.type === 'single' ? reminder.time : ''}" required>
          </div>
        </div>
        
        <!-- Recurring Fields -->
        <div class="reminder-type-fields" data-type="recurring" ${reminder && reminder.type === 'recurring' ? '' : 'style="display: none;"'}>
          <div class="form-group">
            <label class="form-label" for="reminder-repeat-select">Repeat</label>
            <select id="reminder-repeat-select" class="reminder-repeat-select">
              <option value="daily" ${reminder && reminder.repeat === 'daily' ? 'selected' : ''}>Daily</option>
              <option value="weekly" ${reminder && reminder.repeat === 'weekly' ? 'selected' : ''}>Weekly</option>
              <option value="weekdays" ${reminder && reminder.repeat === 'weekdays' ? 'selected' : ''}>Weekdays</option>
              <option value="custom" ${reminder && reminder.repeat === 'custom' ? 'selected' : ''}>Custom Days</option>
            </select>
          </div>
          
          <div class="form-group custom-days-group" ${reminder && reminder.repeat === 'custom' ? '' : 'style="display: none;"'}>
            <label class="form-label">Days of Week</label>
            <div class="days-selector">
              ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => `
                <label class="day-checkbox">
                  <input type="checkbox" value="${index}" 
                         ${reminder && reminder.days && reminder.days.includes(index) ? 'checked' : ''}>
                  <span>${day}</span>
                </label>
              `).join('')}
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Time Window</label>
            <div class="time-window-group">
              <div class="time-input-group">
                <label for="window-start">From</label>
                <input type="time" id="window-start" class="reminder-time-input" 
                       value="${reminder && reminder.windowStart ? reminder.windowStart : '09:00'}">
              </div>
              <div class="time-input-group">
                <label for="window-end">To</label>
                <input type="time" id="window-end" class="reminder-time-input" 
                       value="${reminder && reminder.windowEnd ? reminder.windowEnd : '21:00'}">
              </div>
            </div>
            <p class="form-help-text">Reminders will only trigger within this time window</p>
          </div>
        </div>
        
        <!-- Multiple Times Fields -->
        <div class="reminder-type-fields" data-type="multiple" ${reminder && reminder.type === 'multiple' ? '' : 'style="display: none;"'}>
          <div class="form-group">
            <label class="form-label">Notification Times</label>
            <div class="times-container" id="times-container">
              ${reminder && reminder.type === 'multiple' && reminder.times ? 
                reminder.times.map((time, index) => `
                  <div class="time-item">
                    <input type="time" class="reminder-time-input" value="${time}" data-index="${index}">
                    <button type="button" class="remove-time-btn" data-index="${index}">
                      <i class="material-icons-round">remove</i>
                    </button>
                  </div>
                `).join('') : `
                  <div class="time-item">
                    <input type="time" class="reminder-time-input" value="09:00" data-index="0">
                    <button type="button" class="remove-time-btn" data-index="0">
                      <i class="material-icons-round">remove</i>
                    </button>
                  </div>
                `
              }
            </div>
            <button type="button" class="add-time-btn" id="add-time-btn">
              <i class="material-icons-round">add</i>
              Add Time
            </button>
            <p class="form-help-text">Add multiple notification times for the same reminder</p>
          </div>
          
          <div class="form-group">
            <label class="form-label">Days</label>
            <div class="days-selector">
              ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => `
                <label class="day-checkbox">
                  <input type="checkbox" value="${index}" 
                         ${reminder && reminder.days && reminder.days.includes(index) ? 'checked' : ''}>
                  <span>${day}</span>
                </label>
              `).join('')}
            </div>
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label" for="reminder-notes-input">Notes (Optional)</label>
          <textarea id="reminder-notes-input" class="reminder-notes-input" 
                    placeholder="Add any additional notes about this reminder...">${reminder ? reminder.notes || '' : ''}</textarea>
        </div>
        
        <button type="submit" class="save-reminder-btn">
          ${isEdit ? 'Update Reminder' : 'Save Reminder'}
        </button>
        
        ${isEdit ? `
          <button type="button" class="icon-btn delete-reminder-btn" id="delete-reminder-btn">
            <i class="material-icons-round">delete</i>
            Delete Reminder
          </button>
        ` : ''}
      </form>
    `;
    
    this.elements.remindersPanel.innerHTML = html;
  }
  
  /**
   * Render system notification card
   */
  renderSystemNotificationCard(type, title, icon, description) {
    const notification = this.data.systemNotifications[type];
    const isExpanded = this.expandedSystemNotifications.has(type);
    
    return `
      <div class="system-notification-card">
        <div class="system-notification-header">
          <div class="system-notification-icon">
            <i class="material-icons-round">${icon}</i>
          </div>
          <div class="system-notification-info">
            <div class="system-notification-title">${title}</div>
            <div class="system-notification-description">${description}</div>
          </div>
          <div class="system-notification-controls">
            <label class="reminder-toggle-switch">
              <input type="checkbox" class="system-notification-toggle" data-type="${type}" 
                     ${notification.enabled ? 'checked' : ''}>
              <span class="reminder-toggle-slider"></span>
            </label>
            <button class="system-expand-btn icon-btn" data-type="${type}">
              <i class="material-icons-round">${isExpanded ? 'expand_less' : 'expand_more'}</i>
            </button>
          </div>
        </div>
        
        <div class="system-notification-details" ${isExpanded ? '' : 'style="display: none;"'}>
          ${this.renderSystemNotificationDetails(type, notification)}
        </div>
      </div>
    `;
  }
  
  /**
   * Render system notification details
   */
  renderSystemNotificationDetails(type, notification) {
    const isInterval = type.includes('Interval');
    
    return `
      <div class="notification-detail-form">
        <div class="form-group">
          <label class="form-label">Message</label>
          <input type="text" class="notification-message-input" data-type="${type}" 
                 value="${notification.message}" placeholder="Enter notification message...">
        </div>
        
        ${isInterval ? `
          <div class="form-group">
            <label class="form-label">Interval (minutes)</label>
            <input type="number" class="notification-interval-input" data-type="${type}" 
                   value="${notification.interval}" min="15" max="480" step="15">
          </div>
          
          <div class="form-group">
            <label class="form-label">Active Hours</label>
            <div class="time-window-group">
              <div class="time-input-group">
                <label>From</label>
                <input type="time" class="notification-window-start" data-type="${type}" 
                       value="${notification.activeWindow.start}">
              </div>
              <div class="time-input-group">
                <label>To</label>
                <input type="time" class="notification-window-end" data-type="${type}" 
                       value="${notification.activeWindow.end}">
              </div>
            </div>
          </div>
        ` : `
          <div class="form-group">
            <label class="form-label">Time</label>
            <input type="time" class="notification-time-input" data-type="${type}" 
                   value="${notification.time}">
          </div>
        `}
        
        <div class="form-group">
          <label class="form-label">Days</label>
          <div class="days-selector">
            ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => `
              <label class="day-checkbox">
                <input type="checkbox" class="notification-day-checkbox" data-type="${type}" 
                       value="${index}" ${notification.days.includes(index) ? 'checked' : ''}>
                <span>${day}</span>
              </label>
            `).join('')}
          </div>
        </div>
        
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" class="notification-condition-checkbox" data-type="${type}" 
                   ${notification.onlyIfGoalNotMet || notification.onlyIfBelowGoal ? 'checked' : ''}>
            <span>${isInterval ? 'Only if below goal' : 'Only if goal not met'}</span>
          </label>
        </div>
      </div>
    `;
  }
  
  /**
   * Render custom reminders list
   */
  renderCustomRemindersList() {
    if (this.data.customReminders.length === 0) {
      return `
        <div class="no-reminders">
          <i class="material-icons-round">schedule</i>
          <p>No custom reminders yet</p>
        </div>
      `;
    }
    
    return this.data.customReminders.map(reminder => {
      const isActive = reminder.enabled;
      const typeInfo = this.getCustomReminderTypeInfo(reminder);
      
      return `
        <div class="custom-reminder-item" data-id="${reminder.id}">
          <div class="custom-reminder-main">
            <div class="custom-reminder-info">
              <div class="reminder-title">${reminder.title}</div>
              <div class="reminder-schedule">${typeInfo.schedule}</div>
              ${typeInfo.timeWindow ? `<div class="reminder-time-window">${typeInfo.timeWindow}</div>` : ''}
              ${typeInfo.times ? `<div class="reminder-times">${typeInfo.times}</div>` : ''}
              ${typeInfo.next ? `<div class="reminder-next">Next: ${typeInfo.next}</div>` : ''}
              ${reminder.notes ? `<div class="reminder-notes">${reminder.notes}</div>` : ''}
            </div>
            <div class="custom-reminder-header-controls">
              <label class="reminder-toggle-switch">
                <input type="checkbox" class="custom-reminder-toggle" data-id="${reminder.id}" 
                       ${isActive ? 'checked' : ''}>
                <span class="reminder-toggle-slider"></span>
              </label>
              <i class="material-icons-round">chevron_right</i>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
  
  /**
   * Get custom reminder type information for display
   */
  getCustomReminderTypeInfo(reminder) {
    const info = { schedule: '', timeWindow: '', times: '', next: '' };
    
    switch (reminder.type) {
      case 'single':
        info.schedule = `${new Date(reminder.date).toLocaleDateString()} at ${reminder.time}`;
        const reminderDate = new Date(`${reminder.date}T${reminder.time}`);
        if (reminderDate > new Date()) {
          info.next = reminderDate.toLocaleString();
        }
        break;
        
      case 'recurring':
        const days = this.getDayNames(reminder.days);
        info.schedule = `${reminder.repeat} • ${days}`;
        if (reminder.windowStart && reminder.windowEnd) {
          info.timeWindow = `Active ${reminder.windowStart} - ${reminder.windowEnd}`;
        }
        break;
        
      case 'multiple':
        const dayNames = this.getDayNames(reminder.days);
        info.schedule = dayNames;
        if (reminder.times && reminder.times.length > 0) {
          info.times = `Times: ${reminder.times.join(', ')}`;
        }
        break;
    }
    
    return info;
  }
  
  /**
   * Get day names from day indices
   */
  getDayNames(dayIndices) {
    if (!dayIndices || dayIndices.length === 0) return 'No days selected';
    
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (dayIndices.length === 7) return 'Every day';
    if (dayIndices.length === 5 && !dayIndices.includes(0) && !dayIndices.includes(6)) return 'Weekdays';
    if (dayIndices.length === 2 && dayIndices.includes(0) && dayIndices.includes(6)) return 'Weekends';
    
    return dayIndices.map(i => dayNames[i]).join(', ');
  }
  
  /**
   * Get active system reminders count
   */
  getActiveSystemRemindersCount() {
    return Object.values(this.data.systemNotifications).filter(n => n.enabled).length;
  }
  
  /**
   * UPDATED: Attach event listeners to panel elements with server settings
   */
  attachPanelEventListeners() {
    console.log('Attaching panel event listeners for view:', this.currentView);
    
    // Close panel button
    const closeBtn = this.elements.remindersPanel.querySelector('.close-panel');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        console.log('Close button clicked');
        this.closePanel();
      });
    }
    
    // Back button
    const backBtn = document.getElementById('back-to-main');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        console.log('Back button clicked');
        this.backToMain();
      });
    }
    
    // Global toggle
    this.elements.globalToggle = document.getElementById('global-reminders-toggle');
    if (this.elements.globalToggle) {
      this.elements.globalToggle.addEventListener('change', (e) => {
        console.log('Global toggle changed:', e.target.checked);
        if (e.target.checked) {
          this.requestNotificationPermission();
        } else {
          this.data.globalEnabled = false;
          this.saveData();
          this.clearAllTimers();
          utils.showToast('All reminders disabled', 'info');
        }
      });
    }
    
    // System reminders button
    const systemBtn = document.getElementById('system-reminders-btn');
    if (systemBtn) {
      systemBtn.addEventListener('click', () => {
        console.log('System reminders button clicked');
        this.showSystemReminders();
      });
    }

    // NEW: Server settings button
    const serverSettingsBtn = document.getElementById('server-settings-btn');
    if (serverSettingsBtn) {
      serverSettingsBtn.addEventListener('click', () => {
        console.log('Server settings button clicked');
        this.showServerSettings();
      });
    }

    // NEW: Server settings event listeners
    if (this.currentView === 'server-settings') {
      this.attachServerSettingsListeners();
    }
    
    // Add custom reminder button
    const addBtn = document.getElementById('add-custom-reminder');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        console.log('Add custom reminder button clicked');
        this.currentView = 'add-custom';
        this.renderPanel();
      });
    }
    
    // View-specific event listeners
    switch (this.currentView) {
      case 'system':
        this.attachSystemRemindersListeners();
        break;
      case 'add-custom':
      case 'edit-custom':
        this.attachCustomReminderFormListeners();
        break;
      case 'main':
        this.attachMainViewListeners();
        break;
    }
  }

  // NEW: Server settings specific event listeners
  attachServerSettingsListeners() {
    // Refresh connection button
    const refreshBtn = document.getElementById('refresh-connection-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        console.log('Refresh connection clicked');
        refreshBtn.disabled = true;
        
        const result = await this.testServerConnection();
        
        if (result.success) {
          utils.showToast('Server connection successful!', 'success');
        } else {
          utils.showToast(`Connection failed: ${result.error}`, 'error');
        }
        
        // Re-render to update status
        this.renderServerSettingsView();
        this.attachServerSettingsListeners();
      });
    }

    // Test connection button
    const testConnectionBtn = document.getElementById('test-connection-btn');
    if (testConnectionBtn) {
      testConnectionBtn.addEventListener('click', async () => {
        console.log('Test connection clicked');
        testConnectionBtn.disabled = true;
        
        const result = await this.testServerConnection();
        
        if (result.success) {
          utils.showToast(`Server healthy! Uptime: ${Math.round(result.data.uptime / 60)} minutes`, 'success');
        } else {
          utils.showToast(`Server test failed: ${result.error}`, 'error');
        }
        
        // Re-render to update status
        this.renderServerSettingsView();
        this.attachServerSettingsListeners();
      });
    }

    // Test notification button
    const testNotificationBtn = document.getElementById('test-notification-btn');
    if (testNotificationBtn) {
      testNotificationBtn.addEventListener('click', async () => {
        console.log('Test notification clicked');
        testNotificationBtn.disabled = true;
        
        await this.sendTestNotification();
        
        setTimeout(() => {
          testNotificationBtn.disabled = false;
        }, 2000);
      });
    }

    // Reconnect server button
    const reconnectBtn = document.getElementById('reconnect-server-btn');
    if (reconnectBtn) {
      reconnectBtn.addEventListener('click', async () => {
        console.log('Reconnect server clicked');
        reconnectBtn.disabled = true;
        
        utils.showToast('Reconnecting to server...', 'info');
        
        // Re-setup push notifications
        await this.setupPushNotifications();
        
        // Re-render to update status
        this.renderServerSettingsView();
        this.attachServerSettingsListeners();
      });
    }
  }
  
  /**
   * Attach event listeners for main view
   */
  attachMainViewListeners() {
    // Custom reminder toggles
    document.querySelectorAll('.custom-reminder-toggle').forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        const reminderId = e.target.dataset.id;
        const enabled = e.target.checked;
        this.toggleCustomReminder(reminderId, enabled);
      });
    });
    
    // Custom reminder click to edit (except toggle)
    document.querySelectorAll('.custom-reminder-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // Don't trigger if clicking on toggle
        if (e.target.closest('.custom-reminder-toggle') || 
            e.target.closest('.reminder-toggle-switch')) {
          return;
        }
        
        const reminderId = item.dataset.id;
        this.editCustomReminder(reminderId);
      });
    });
  }
  
  /**
   * Attach event listeners for system reminders view
   */
  attachSystemRemindersListeners() {
    // System notification toggles
    document.querySelectorAll('.system-notification-toggle').forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        const type = e.target.dataset.type;
        const enabled = e.target.checked;
        this.toggleSystemNotification(type, enabled);
      });
    });
    
    // Expand/collapse buttons
    document.querySelectorAll('.system-expand-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = e.target.closest('.system-expand-btn').dataset.type;
        this.toggleSystemNotificationExpansion(type);
      });
    });
    
    // Form field change handlers
    this.attachSystemNotificationFormListeners();
  }
  
  /**
   * Attach form listeners for system notifications
   */
  attachSystemNotificationFormListeners() {
    // Message inputs
    document.querySelectorAll('.notification-message-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const type = e.target.dataset.type;
        this.data.systemNotifications[type].message = e.target.value;
        this.saveData();
      });
    });
    
    // Interval inputs
    document.querySelectorAll('.notification-interval-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const type = e.target.dataset.type;
        this.data.systemNotifications[type].interval = parseInt(e.target.value);
        this.saveData();
        this.rescheduleSystemNotification(type);
      });
    });
    
    // Time inputs
    document.querySelectorAll('.notification-time-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const type = e.target.dataset.type;
        this.data.systemNotifications[type].time = e.target.value;
        this.saveData();
        this.rescheduleSystemNotification(type);
      });
    });
    
    // Window time inputs
    document.querySelectorAll('.notification-window-start, .notification-window-end').forEach(input => {
      input.addEventListener('change', (e) => {
        const type = e.target.dataset.type;
        const isStart = e.target.classList.contains('notification-window-start');
        
        if (isStart) {
          this.data.systemNotifications[type].activeWindow.start = e.target.value;
        } else {
          this.data.systemNotifications[type].activeWindow.end = e.target.value;
        }
        
        this.saveData();
        this.rescheduleSystemNotification(type);
      });
    });
    
    // Day checkboxes
    document.querySelectorAll('.notification-day-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const type = e.target.dataset.type;
        const day = parseInt(e.target.value);
        
        if (e.target.checked) {
          if (!this.data.systemNotifications[type].days.includes(day)) {
            this.data.systemNotifications[type].days.push(day);
          }
        } else {
          const index = this.data.systemNotifications[type].days.indexOf(day);
          if (index > -1) {
            this.data.systemNotifications[type].days.splice(index, 1);
          }
        }
        
        this.saveData();
        this.rescheduleSystemNotification(type);
      });
    });
    
    // Condition checkboxes
    document.querySelectorAll('.notification-condition-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const type = e.target.dataset.type;
        const checked = e.target.checked;
        
        if (type.includes('Interval')) {
          this.data.systemNotifications[type].onlyIfBelowGoal = checked;
        } else {
          this.data.systemNotifications[type].onlyIfGoalNotMet = checked;
        }
        
        this.saveData();
      });
    });
  }
  
  /**
   * Attach event listeners for custom reminder form
   */
  attachCustomReminderFormListeners() {
    // Form submission
    const form = document.getElementById('custom-reminder-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveCustomReminder();
      });
    }
    
    // Type tabs
    document.querySelectorAll('.reminder-type-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const type = tab.dataset.type;
        this.switchReminderType(type);
      });
    });
    
    // Repeat select
    const repeatSelect = document.getElementById('reminder-repeat-select');
    if (repeatSelect) {
      repeatSelect.addEventListener('change', (e) => {
        const customDaysGroup = document.querySelector('.custom-days-group');
        if (customDaysGroup) {
          customDaysGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
        }
      });
    }
    
    // Add/remove time buttons for multiple times
    const addTimeBtn = document.getElementById('add-time-btn');
    if (addTimeBtn) {
      addTimeBtn.addEventListener('click', () => {
        this.addTimeSlot();
      });
    }
    
    document.addEventListener('click', (e) => {
      if (e.target.closest('.remove-time-btn')) {
        const index = e.target.closest('.remove-time-btn').dataset.index;
        this.removeTimeSlot(index);
      }
    });
    
    // Delete button
    const deleteBtn = document.getElementById('delete-reminder-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        this.deleteCustomReminder();
      });
    }
  }
  
  /**
   * Toggle system notification
   */
  toggleSystemNotification(type, enabled) {
    console.log(`Toggling system notification ${type}:`, enabled);
    
    this.data.systemNotifications[type].enabled = enabled;
    this.saveData();
    
    if (enabled && this.data.globalEnabled) {
      this.scheduleSystemNotification(type);
    } else {
      this.clearSystemNotificationTimer(type);
    }
    
    utils.showToast(`${type} ${enabled ? 'enabled' : 'disabled'}`, enabled ? 'success' : 'info');
  }
  
  /**
   * Toggle system notification expansion
   */
  toggleSystemNotificationExpansion(type) {
    if (this.expandedSystemNotifications.has(type)) {
      this.expandedSystemNotifications.delete(type);
    } else {
      this.expandedSystemNotifications.add(type);
    }
    
    // Re-render just this card
    const card = document.querySelector(`[data-type="${type}"]`).closest('.system-notification-card');
    const isExpanded = this.expandedSystemNotifications.has(type);
    const details = card.querySelector('.system-notification-details');
    const icon = card.querySelector('.system-expand-btn i');
    
    if (details) {
      details.style.display = isExpanded ? 'block' : 'none';
    }
    
    if (icon) {
      icon.textContent = isExpanded ? 'expand_less' : 'expand_more';
    }
    
    // Re-attach form listeners
    this.attachSystemNotificationFormListeners();
  }
  
  /**
   * Reschedule system notification
   */
  rescheduleSystemNotification(type) {
    if (this.data.systemNotifications[type].enabled && this.data.globalEnabled) {
      this.clearSystemNotificationTimer(type);
      this.scheduleSystemNotification(type);
    }
  }
  
  /**
   * Toggle custom reminder
   */
  toggleCustomReminder(reminderId, enabled) {
    const reminder = this.data.customReminders.find(r => r.id === reminderId);
    if (!reminder) return;
    
    reminder.enabled = enabled;
    this.saveData();
    
    if (enabled && this.data.globalEnabled) {
      this.scheduleCustomReminder(reminder);
    } else {
      this.clearCustomReminderTimer(reminderId);
    }
    
    utils.showToast(`${reminder.title} ${enabled ? 'enabled' : 'disabled'}`, enabled ? 'success' : 'info');
  }
  
  /**
   * Edit custom reminder
   */
  editCustomReminder(reminderId) {
    this.editingReminderId = reminderId;
    this.currentView = 'edit-custom';
    this.renderPanel();
  }
  
  /**
   * Switch reminder type in form
   */
  switchReminderType(type) {
    // Update active tab
    document.querySelectorAll('.reminder-type-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.type === type);
    });
    
    // Show/hide relevant fields
    document.querySelectorAll('.reminder-type-fields').forEach(fields => {
      fields.style.display = fields.dataset.type === type ? 'block' : 'none';
    });
  }
  
  /**
   * Add time slot for multiple times
   */
  addTimeSlot() {
    const container = document.getElementById('times-container');
    const currentSlots = container.querySelectorAll('.time-item').length;
    
    const timeItem = document.createElement('div');
    timeItem.className = 'time-item';
    timeItem.innerHTML = `
      <input type="time" class="reminder-time-input" value="09:00" data-index="${currentSlots}">
      <button type="button" class="remove-time-btn" data-index="${currentSlots}">
        <i class="material-icons-round">remove</i>
      </button>
    `;
    
    container.appendChild(timeItem);
  }
  
  /**
   * Remove time slot
   */
  removeTimeSlot(index) {
    const container = document.getElementById('times-container');
    const slots = container.querySelectorAll('.time-item');
    
    if (slots.length > 1) {
      slots[index].remove();
      
      // Re-index remaining slots
      container.querySelectorAll('.time-item').forEach((slot, i) => {
        const input = slot.querySelector('input');
        const button = slot.querySelector('.remove-time-btn');
        input.dataset.index = i;
        button.dataset.index = i;
      });
    }
  }
  
  /**
   * Save custom reminder
   */
  saveCustomReminder() {
    const form = document.getElementById('custom-reminder-form');
    const formData = new FormData(form);
    
    // Get basic data
    const title = document.getElementById('reminder-title-input').value.trim();
    if (!title) {
      utils.showToast('Please enter a reminder title', 'error');
      return;
    }
    
    // Determine active type
    const activeType = document.querySelector('.reminder-type-tab.active').dataset.type;
    
    const reminderData = {
      id: this.editingReminderId || Date.now().toString(),
      title,
      type: activeType,
      enabled: true,
      notes: document.getElementById('reminder-notes-input').value.trim()
    };
    
    // Type-specific data
    switch (activeType) {
      case 'single':
        reminderData.date = document.getElementById('reminder-date-input').value;
        reminderData.time = document.getElementById('reminder-time-input').value;
        
        if (!reminderData.date || !reminderData.time) {
          utils.showToast('Please set date and time', 'error');
          return;
        }
        break;
        
      case 'recurring':
        reminderData.repeat = document.getElementById('reminder-repeat-select').value;
        reminderData.windowStart = document.getElementById('window-start').value;
        reminderData.windowEnd = document.getElementById('window-end').value;
        
        // Handle days
        if (reminderData.repeat === 'custom') {
          reminderData.days = Array.from(document.querySelectorAll('.custom-days-group input[type="checkbox"]:checked'))
            .map(cb => parseInt(cb.value));
        } else {
          reminderData.days = this.getRepeatDays(reminderData.repeat);
        }
        
        if (reminderData.days.length === 0) {
          utils.showToast('Please select at least one day', 'error');
          return;
        }
        break;
        
      case 'multiple':
        // Get all times
        reminderData.times = Array.from(document.querySelectorAll('#times-container .reminder-time-input'))
          .map(input => input.value)
          .filter(time => time);
        
        // Get selected days
        reminderData.days = Array.from(document.querySelectorAll('.reminder-type-fields[data-type="multiple"] .day-checkbox input:checked'))
          .map(cb => parseInt(cb.value));
        
        if (reminderData.times.length === 0) {
          utils.showToast('Please add at least one time', 'error');
          return;
        }
        
        if (reminderData.days.length === 0) {
          utils.showToast('Please select at least one day', 'error');
          return;
        }
        break;
    }
    
    // Save or update
    if (this.editingReminderId) {
      const index = this.data.customReminders.findIndex(r => r.id === this.editingReminderId);
      if (index > -1) {
        this.data.customReminders[index] = reminderData;
      }
    } else {
      this.data.customReminders.push(reminderData);
    }
    
    this.saveData();
    
    // Schedule if enabled
    if (reminderData.enabled && this.data.globalEnabled) {
      this.scheduleCustomReminder(reminderData);
    }
    
    utils.showToast(`Reminder ${this.editingReminderId ? 'updated' : 'created'} successfully`, 'success');
    this.backToMain();
  }
  
  /**
   * Delete custom reminder
   */
  deleteCustomReminder() {
    if (!this.editingReminderId) return;
    
    if (confirm('Are you sure you want to delete this reminder?')) {
      const index = this.data.customReminders.findIndex(r => r.id === this.editingReminderId);
      if (index > -1) {
        this.clearCustomReminderTimer(this.editingReminderId);
        this.data.customReminders.splice(index, 1);
        this.saveData();
        utils.showToast('Reminder deleted', 'info');
        this.backToMain();
      }
    }
  }
  
  /**
   * Get repeat days based on repeat type
   */
  getRepeatDays(repeat) {
    switch (repeat) {
      case 'daily':
        return [0, 1, 2, 3, 4, 5, 6];
      case 'weekly':
        return [new Date().getDay()];
      case 'weekdays':
        return [1, 2, 3, 4, 5];
      default:
        return [];
    }
  }
  
  /**
   * Start all active reminders
   */
  startAllReminders() {
    if (!this.data.globalEnabled) {
      console.log('Global reminders disabled, not starting any reminders');
      return;
    }
    
    console.log('Starting all active reminders...');
    
    // Start system notifications
    Object.keys(this.data.systemNotifications).forEach(type => {
      if (this.data.systemNotifications[type].enabled) {
        this.scheduleSystemNotification(type);
      }
    });
    
    // Start custom reminders
    this.data.customReminders.forEach(reminder => {
      if (reminder.enabled) {
        this.scheduleCustomReminder(reminder);
      }
    });
  }
  
  /**
   * Clear all timers
   */
  clearAllTimers() {
    console.log('Clearing all timers...');
    
    // Clear active timers
    this.activeTimers.forEach((timer, key) => {
      clearTimeout(timer);
    });
    this.activeTimers.clear();
    
    // Clear interval timers
    this.intervalTimers.forEach((timer, key) => {
      clearInterval(timer);
    });
    this.intervalTimers.clear();
  }
  
  /**
   * Schedule system notification
   */
  scheduleSystemNotification(type) {
    const notification = this.data.systemNotifications[type];
    if (!notification || !notification.enabled || !notification.days || notification.days.length === 0) return;
    
    console.log('Scheduling system notification:', type);
    
    if (type.includes('Interval')) {
      this.scheduleIntervalReminder(type);
    } else {
      this.scheduleTimeBasedNotification(type, {
        time: notification.time,
        days: notification.days,
        callback: () => this.triggerGoalCheckAlert(type)
      });
    }
  }
  
  /**
   * Schedule interval notifications
   */
  scheduleIntervalReminder(type) {
    const config = this.data.systemNotifications[type];
    if (!config.enabled || !config.days || config.days.length === 0) return;
    
    const intervalMs = config.interval * 60 * 1000;
    
    const checkAndSchedule = () => {
      const now = new Date();
      const currentDay = now.getDay();
      
      // Check day and time window
      const dayMatch = config.days.includes(currentDay);
      const timeMatch = this.isTimeInActiveWindow(now, config.activeWindow);
      
      if (dayMatch && timeMatch) {
        this.triggerIntervalReminder(type);
      }
    };
    
    const timer = setInterval(checkAndSchedule, intervalMs);
    this.intervalTimers.set(type, timer);
  }
  
  /**
   * Schedule time-based notification with daily repetition
   */
  scheduleTimeBasedNotification(timerId, config) {
    const scheduleNext = () => {
      const now = new Date();
      const [hours, minutes] = config.time.split(':').map(Number);
      
      // Find next occurrence
      let nextTrigger = new Date();
      nextTrigger.setHours(hours, minutes, 0, 0);
      
      // If time has passed today, schedule for tomorrow
      if (nextTrigger <= now) {
        nextTrigger.setDate(nextTrigger.getDate() + 1);
      }
      
      // Find next valid day
      while (!config.days.includes(nextTrigger.getDay())) {
        nextTrigger.setDate(nextTrigger.getDate() + 1);
      }
      
      const delay = nextTrigger.getTime() - now.getTime();
      console.log(`Scheduling ${timerId} for ${nextTrigger.toLocaleString()}`);
      
      const timer = setTimeout(() => {
        config.callback();
        scheduleNext(); // Schedule next occurrence
      }, delay);
      
      this.activeTimers.set(timerId, timer);
    };
    
    scheduleNext();
  }
  
  /**
   * Check if current time is in active window
   */
  isTimeInActiveWindow(now, window) {
    if (!window || !window.start || !window.end) return true;
    
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const [startHours, startMinutes] = window.start.split(':').map(Number);
    const [endHours, endMinutes] = window.end.split(':').map(Number);
    
    const startTime = startHours * 60 + startMinutes;
    const endTime = endHours * 60 + endMinutes;
    
    return currentTime >= startTime && currentTime <= endTime;
  }
  
  /**
   * UPDATED: Trigger goal check alert with server notification
   */
  triggerGoalCheckAlert(type) {
    const notification = this.data.systemNotifications[type];
    if (!notification || !notification.enabled) return;
    
    console.log('Triggering goal check alert:', type);
    
    // Check if we should only notify if goal not met
    if (notification.onlyIfGoalNotMet) {
      const trackerType = type.replace('Alert', '');
      const tracker = window[`${trackerType}Tracker`];
      
      if (tracker && tracker.isGoalMet && tracker.isGoalMet()) {
        console.log(`Goal already met for ${trackerType}, skipping notification`);
        return;
      }
    }
    
    // Show local notification
    this.showNotification(
      'Health Tracker',
      notification.message || `Time to check your ${type.replace('Alert', '')} goal!`
    );
    
    // NEW: Also send via server
    this.sendServerNotification(
      'Health Tracker',
      notification.message || `Time to check your ${type.replace('Alert', '')} goal!`,
      { type: 'goal-alert', reminderType: type }
    );
  }
  
  /**
   * UPDATED: Trigger interval reminder with server notification
   */
  triggerIntervalReminder(type) {
    const notification = this.data.systemNotifications[type];
    if (!notification || !notification.enabled) return;
    
    console.log('Triggering interval reminder:', type);
    
    // Check if we should only notify if below goal
    if (notification.onlyIfBelowGoal) {
      const trackerType = type.replace('Interval', '');
      const tracker = window[`${trackerType}Tracker`];
      
      if (tracker && tracker.isGoalMet && tracker.isGoalMet()) {
        console.log(`Goal already met for ${trackerType}, skipping notification`);
        return;
      }
    }
    
    // Show local notification
    this.showNotification(
      'Health Tracker',
      notification.message || `Time for your ${type.replace('Interval', '')} reminder!`
    );
    
    // NEW: Also send via server
    this.sendServerNotification(
      'Health Tracker',
      notification.message || `Time for your ${type.replace('Interval', '')} reminder!`,
      { type: 'interval-reminder', reminderType: type }
    );
  }
  
  /**
   * Schedule custom reminder
   */
  scheduleCustomReminder(reminder) {
    if (!reminder.enabled) return;
    
    console.log('Scheduling custom reminder:', reminder.title);
    
    switch (reminder.type) {
      case 'single':
        this.scheduleSingleReminder(reminder);
        break;
      case 'recurring':
        this.scheduleRecurringReminder(reminder);
        break;
      case 'multiple':
        this.scheduleMultipleTimesReminder(reminder);
        break;
    }
  }
  
  /**
   * Schedule single reminder
   */
  scheduleSingleReminder(reminder) {
    const reminderDateTime = new Date(`${reminder.date}T${reminder.time}`);
    const now = new Date();
    
    if (reminderDateTime <= now) {
      console.log('Single reminder time has passed:', reminder.title);
      return;
    }
    
    const delay = reminderDateTime.getTime() - now.getTime();
    
    const timer = setTimeout(() => {
      this.triggerCustomReminder(reminder);
    }, delay);
    
    this.activeTimers.set(reminder.id, timer);
  }
  
  /**
   * Schedule recurring reminder
   */
  scheduleRecurringReminder(reminder) {
    const scheduleNext = () => {
      const now = new Date();
      let nextTrigger = new Date(now);
      
      // Set base time to window start
      const [startHours, startMinutes] = reminder.windowStart.split(':').map(Number);
      nextTrigger.setHours(startHours, startMinutes, 0, 0);
      
      // If time has passed today, try tomorrow
      if (nextTrigger <= now) {
        nextTrigger.setDate(nextTrigger.getDate() + 1);
        nextTrigger.setHours(startHours, startMinutes, 0, 0);
      }
      
      // Find next valid day
      while (!reminder.days.includes(nextTrigger.getDay())) {
        nextTrigger.setDate(nextTrigger.getDate() + 1);
      }
      
      const delay = nextTrigger.getTime() - now.getTime();
      
      const timer = setTimeout(() => {
        // Check if we're still in the active window
        const currentTime = new Date();
        if (this.isTimeInActiveWindow(currentTime, { start: reminder.windowStart, end: reminder.windowEnd })) {
          this.triggerCustomReminder(reminder);
        }
        scheduleNext(); // Schedule next occurrence
      }, delay);
      
      this.activeTimers.set(reminder.id, timer);
    };
    
    scheduleNext();
  }
  
  /**
   * Schedule multiple times reminder
   */
  scheduleMultipleTimesReminder(reminder) {
    reminder.times.forEach((time, index) => {
      this.scheduleTimeBasedNotification(`${reminder.id}-${index}`, {
        time,
        days: reminder.days,
        callback: () => this.triggerCustomReminder(reminder)
      });
    });
  }
  
  /**
   * Trigger custom reminder
   */
  triggerCustomReminder(reminder) {
    console.log('Triggering custom reminder:', reminder.title);
    
    this.showNotification(
      reminder.title,
      reminder.notes || 'Custom reminder notification'
    );
    
    // NEW: Also send via server
    this.sendServerNotification(
      reminder.title,
      reminder.notes || 'Custom reminder notification',
      { type: 'custom-reminder', reminderId: reminder.id }
    );
  }
  
  /**
   * Show notification
   */
  showNotification(title, body, options = {}) {
    if (!this.data.globalEnabled || Notification.permission !== 'granted') {
      console.log('Notifications not enabled or permission denied');
      return;
    }
    
    const notification = new Notification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'health-tracker',
      requireInteraction: false,
      ...options
    });
    
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    
    // Auto-close after 10 seconds
    setTimeout(() => {
      notification.close();
    }, 10000);
  }
  
  /**
   * Clear system notification timer
   */
  clearSystemNotificationTimer(type) {
    if (this.activeTimers.has(type)) {
      clearTimeout(this.activeTimers.get(type));
      this.activeTimers.delete(type);
    }
    
    if (this.intervalTimers.has(type)) {
      clearInterval(this.intervalTimers.get(type));
      this.intervalTimers.delete(type);
    }
  }
  
  /**
   * Clear custom reminder timer
   */
  clearCustomReminderTimer(reminderId) {
    // Clear main timer
    if (this.activeTimers.has(reminderId)) {
      clearTimeout(this.activeTimers.get(reminderId));
      this.activeTimers.delete(reminderId);
    }
    
    // Clear multiple times timers
    const multipleTimersKeys = Array.from(this.activeTimers.keys()).filter(key => key.startsWith(reminderId + '-'));
    multipleTimersKeys.forEach(key => {
      clearTimeout(this.activeTimers.get(key));
      this.activeTimers.delete(key);
    });
  }
}