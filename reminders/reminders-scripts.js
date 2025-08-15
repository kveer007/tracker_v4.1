/**
 * Health Tracker App - Reminders Management System (UPDATED WITH SERVER NOTIFICATIONS)
 * 
 * FEATURES:
 * - Goal alerts without time windows (daily check only)
 * - Interval reminders with active hours only
 * - Multiple times support for custom reminders
 * - Manual expansion for system notifications
 * - Inline toggles for custom reminders
 * - Server-based push notifications with debug logging
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
    
    // Server notification properties
    this.serverUrl = 'https://192.168.0.147';
    this.userId = this.generateUserId();
    this.pushSubscription = null;
    this.pushNotificationsEnabled = false;
    this.serverConnectionStatus = 'disconnected';
    this.lastServerTest = null;
    
    // Debug logging system
    this.debugLogs = [];
    this.maxLogs = 50;
    
    // Initialize
    this.loadData();
    this.initializeElements();
    
    console.log('🔄 [RemindersManager] Constructor - calling setupPushNotifications');
    this.setupPushNotifications();
    
    // Start reminders if enabled
    if (this.data.globalEnabled) {
      this.startAllReminders();
    }
    
    console.log('RemindersManager initialized successfully');
  }

  // ============================================================================
  // CORE INITIALIZATION METHODS
  // ============================================================================

  /**
   * Generate simple user ID
   */
  generateUserId() {
    let userId = localStorage.getItem('health_tracker_user_id');
    if (!userId) {
      userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('health_tracker_user_id', userId);
    }
    return userId;
  }

  /**
   * Load reminders data from localStorage
   */
  loadData() {
    try {
      this.data = JSON.parse(localStorage.getItem(this.remindersKey)) || {};
      console.log('Loaded reminders data:', this.data);
      
      // Merge with defaults to ensure all properties exist
      this.data = {
        ...this.defaultData,
        ...this.data,
        systemNotifications: {
          ...this.defaultData.systemNotifications,
          ...(this.data.systemNotifications || {})
        }
      };
      
      // Migrate legacy notification settings
      this.migrateLegacySettings();
      
      // Ensure customReminders array exists
      if (!Array.isArray(this.data.customReminders)) {
        this.data.customReminders = [];
      }
      
    } catch (error) {
      console.error('Error loading reminders data:', error);
      this.data = { ...this.defaultData };
    }
  }

  /**
   * Initialize DOM elements
   */
  initializeElements() {
    console.log('Initializing RemindersManager...');
    
    // Get the reminders panel element
    this.elements = {
      remindersPanel: document.getElementById('reminders-panel'),
      bellIcon: document.getElementById('reminders-bell-icon')
    };
    
    if (!this.elements.remindersPanel) {
      console.error('Reminders panel not found in DOM');
      return;
    }
    
    if (!this.elements.bellIcon) {
      console.error('Bell icon not found in DOM');
      return;
    }
    
    // Set up bell icon click handler
    this.elements.bellIcon.addEventListener('click', () => {
      console.log('Bell icon clicked');
      this.togglePanel();
    });
    
    // Initial render
    this.renderPanel();
  }

  /**
   * Save data to localStorage
   */
  saveData() {
    try {
      localStorage.setItem(this.remindersKey, JSON.stringify(this.data));
    } catch (error) {
      console.error('Error saving reminders data:', error);
    }
  }

  /**
   * Migrate legacy notification settings
   */
  migrateLegacySettings() {
    // Check if we need to migrate from legacy settings
    const globalEnabled = localStorage.getItem(this.legacyNotificationKeys.global);
    if (globalEnabled !== null && this.data.globalEnabled === false) {
      this.data.globalEnabled = globalEnabled === 'true';
      
      // Migrate individual notification settings
      const waterAlert = localStorage.getItem(this.legacyNotificationKeys.waterAlert);
      if (waterAlert === 'true') {
        this.data.systemNotifications.waterAlert.enabled = true;
      }
      
      const proteinAlert = localStorage.getItem(this.legacyNotificationKeys.proteinAlert);
      if (proteinAlert === 'true') {
        this.data.systemNotifications.proteinAlert.enabled = true;
      }
      
      // Save migrated data
      this.saveData();
      
      // Clean up legacy keys
      Object.values(this.legacyNotificationKeys).forEach(key => {
        localStorage.removeItem(key);
      });
    }
  }

  // ============================================================================
  // DEBUG LOGGING SYSTEM
  // ============================================================================

  /**
   * Add log entry method
   */
  addDebugLog(level, message, data = null) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      timestamp,
      level, // 'info', 'success', 'warning', 'error'
      message,
      data: data ? JSON.stringify(data, null, 2) : null
    };
    
    this.debugLogs.push(logEntry);
    
    // Keep only last maxLogs entries
    if (this.debugLogs.length > this.maxLogs) {
      this.debugLogs = this.debugLogs.slice(-this.maxLogs);
    }
    
    // Also log to console for debugging
    const emoji = {
      'info': 'ℹ️',
      'success': '✅',
      'warning': '⚠️',
      'error': '❌'
    }[level] || 'ℹ️';
    
    console.log(`${emoji} [${timestamp}] ${message}`, data || '');
    
    // Update log display if server settings is open
    if (this.currentView === 'server-settings') {
      this.updateDebugLogDisplay();
    }
  }

  /**
   * Update debug log display
   */
  updateDebugLogDisplay() {
    const logContainer = document.getElementById('debug-log-content');
    if (!logContainer) return;
    
    const logHtml = this.debugLogs.map(log => {
      const levelClass = `log-${log.level}`;
      const dataHtml = log.data ? `<div class="log-data">${log.data}</div>` : '';
      
      return `
        <div class="log-entry ${levelClass}">
          <span class="log-timestamp">${log.timestamp}</span>
          <span class="log-message">${log.message}</span>
          ${dataHtml}
        </div>
      `;
    }).join('');
    
    logContainer.innerHTML = logHtml;
    
    // Auto-scroll to bottom
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  /**
   * Clear debug logs
   */
  clearDebugLogs() {
    this.debugLogs = [];
    this.addDebugLog('info', 'Debug logs cleared');
  }

  // ============================================================================
  // SERVER NOTIFICATION METHODS
  // ============================================================================

  /**
   * Setup push notifications with comprehensive logging
   */
  async setupPushNotifications() {
    this.addDebugLog('info', 'Starting push notification setup...');
    this.addDebugLog('info', `Server URL: ${this.serverUrl}`);
    this.addDebugLog('info', `User ID: ${this.userId}`);
    
    try {
      // Update status to connecting
      this.serverConnectionStatus = 'connecting';
      this.addDebugLog('info', 'Status set to connecting');

      // Check browser support
      if (!('serviceWorker' in navigator)) {
        this.addDebugLog('error', 'Service worker not supported');
        this.serverConnectionStatus = 'error';
        return;
      }
      
      if (!('PushManager' in window)) {
        this.addDebugLog('error', 'Push manager not supported');
        this.serverConnectionStatus = 'error';
        return;
      }
      
      this.addDebugLog('success', 'Browser supports push notifications');

      // Check notification permission first
      let permission = Notification.permission;
      this.addDebugLog('info', `Current permission: ${permission}`);
      
      if (permission === 'default') {
        this.addDebugLog('info', 'Requesting notification permission...');
        permission = await Notification.requestPermission();
        this.addDebugLog('info', `Permission after request: ${permission}`);
      }
      
      if (permission !== 'granted') {
        this.addDebugLog('error', 'Notification permission denied');
        this.serverConnectionStatus = 'error';
        return;
      }

      // Check service worker with timeout
      this.addDebugLog('info', 'Waiting for service worker...');
      
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Service worker timeout (15 seconds)')), 15000)
        )
      ]);
      
      this.addDebugLog('success', 'Service worker ready', {
        scope: registration.scope,
        active: !!registration.active
      });

      // Test server health
      this.addDebugLog('info', 'Testing server health...');
      const healthResponse = await fetch(`${this.serverUrl}/health`);
      this.addDebugLog('info', `Health response status: ${healthResponse.status}`);
      
      if (!healthResponse.ok) {
        throw new Error(`Health check failed: ${healthResponse.status}`);
      }
      
      const healthData = await healthResponse.json();
      this.addDebugLog('success', 'Server health check passed', {
        status: healthData.status,
        uptime: Math.round(healthData.uptime / 60) + ' minutes'
      });

      // Get VAPID key
      this.addDebugLog('info', 'Getting VAPID key...');
      const vapidResponse = await fetch(`${this.serverUrl}/vapid-public-key`);
      this.addDebugLog('info', `VAPID response status: ${vapidResponse.status}`);
      
      if (!vapidResponse.ok) {
        throw new Error(`VAPID failed: ${vapidResponse.status} ${vapidResponse.statusText}`);
      }
      
      const { publicKey } = await vapidResponse.json();
      this.addDebugLog('success', `VAPID public key received (${publicKey.length} chars)`);

      // Subscribe to push notifications
      this.addDebugLog('info', 'Creating push subscription...');
      this.pushSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(publicKey)
      });
      this.addDebugLog('success', 'Push subscription created', {
        endpoint: this.pushSubscription.endpoint.substring(0, 50) + '...'
      });

      // Send subscription to server
      this.addDebugLog('info', 'Sending subscription to server...');
      const subscribeResponse = await fetch(`${this.serverUrl}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: this.pushSubscription,
          userId: this.userId
        })
      });

      this.addDebugLog('info', `Subscribe response status: ${subscribeResponse.status}`);

      if (!subscribeResponse.ok) {
        const errorText = await subscribeResponse.text();
        throw new Error(`Failed to subscribe: ${subscribeResponse.status} ${errorText}`);
      }

      const subscribeData = await subscribeResponse.json();
      this.addDebugLog('success', 'Subscription sent to server', subscribeData);

      this.addDebugLog('success', '🎉 Push notifications setup complete!');
      this.pushNotificationsEnabled = true;
      this.serverConnectionStatus = 'connected';
      this.lastServerTest = new Date();

      // Re-render to update status
      if (this.currentView === 'server-settings') {
        this.renderServerSettingsView();
        this.attachServerSettingsListeners();
      }

    } catch (error) {
      this.addDebugLog('error', `Push notification setup failed: ${error.message}`, {
        stack: error.stack
      });
      this.pushNotificationsEnabled = false;
      this.serverConnectionStatus = 'error';
      
      // Re-render to update status
      if (this.currentView === 'server-settings') {
        this.renderServerSettingsView();
        this.attachServerSettingsListeners();
      }
    }
  }

  /**
   * Send notification via server
   */
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

  /**
   * Test server connection
   */
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

  /**
   * Send test notification
   */
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

  /**
   * Get server connection status with details
   */
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

  /**
   * Get device info for debugging
   */
  getDeviceInfo() {
    const ua = navigator.userAgent;
    
    if (/iPad|iPhone|iPod/.test(ua)) {
      const isStandalone = window.navigator.standalone;
      const version = ua.match(/OS (\d+)_(\d+)/);
      const osVersion = version ? `iOS ${version[1]}.${version[2]}` : 'iOS';
      return `${osVersion} ${isStandalone ? '(PWA)' : '(Safari)'}`;
    } else if (/Android/.test(ua)) {
      const version = ua.match(/Android (\d+\.?\d*)/);
      const osVersion = version ? `Android ${version[1]}` : 'Android';
      return osVersion;
    } else if (/Windows/.test(ua)) {
      return 'Windows';
    } else if (/Mac/.test(ua)) {
      return 'macOS';
    } else {
      return 'Unknown';
    }
  }

  /**
   * Helper function for VAPID key conversion
   */
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

  // ============================================================================
  // PANEL MANAGEMENT METHODS
  // ============================================================================

  /**
   * Toggle reminders panel visibility
   */
  togglePanel() {
    if (this.elements.remindersPanel.classList.contains('active')) {
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
    this.elements.remindersPanel.classList.add('active');
    this.renderPanel();
  }

  /**
   * Close reminders panel
   */
  closePanel() {
    console.log('Closing reminders panel');
    this.elements.remindersPanel.classList.remove('active');
  }

  /**
   * Navigate back to main view
   */
  backToMain() {
    this.currentView = 'main';
    this.renderPanel();
  }

  /**
   * Show server settings
   */
  showServerSettings() {
    this.currentView = 'server-settings';
    this.renderPanel();
  }

  /**
   * Show system reminders
   */
  showSystemReminders() {
    this.currentView = 'system';
    this.renderPanel();
  }

  // ============================================================================
  // RENDERING METHODS
  // ============================================================================

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
   * Render main reminders view with server settings button
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

  /**
   * Render server settings view with debug log section
   */
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
            <div class="server-detail-item">
              <span class="detail-label">Device:</span>
              <span class="detail-value">${this.getDeviceInfo()}</span>
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

      <!-- Debug Log Section -->
      <div class="debug-log-section">
        <div class="debug-log-header">
          <h4>Connection Debug Log</h4>
          <button class="icon-btn clear-log-btn" id="clear-log-btn" title="Clear log">
            <i class="material-icons-round">clear_all</i>
          </button>
        </div>
        <div class="debug-log-container">
          <div class="debug-log-content" id="debug-log-content">
            <!-- Debug logs will be populated here -->
          </div>
        </div>
        <div class="debug-log-footer">
          <div class="log-legend">
            <span class="legend-item info">ℹ️ Info</span>
            <span class="legend-item success">✅ Success</span>
            <span class="legend-item warning">⚠️ Warning</span>
            <span class="legend-item error">❌ Error</span>
          </div>
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
    
    // Update debug log display
    this.updateDebugLogDisplay();
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
        ${this.renderSystemNotificationCard('waterAlert', 'Water Goal Alert', 'water_drop', 'Check your daily water goal progress')}
        ${this.renderSystemNotificationCard('waterInterval', 'Water Interval Reminder', 'schedule', 'Regular water intake reminders')}
        ${this.renderSystemNotificationCard('proteinAlert', 'Protein Goal Alert', 'fitness_center', 'Check your daily protein goal progress')}
        ${this.renderSystemNotificationCard('proteinInterval', 'Protein Interval Reminder', 'timer', 'Regular protein intake reminders')}
      </div>
    `;
    
    this.elements.remindersPanel.innerHTML = html;
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

  // ============================================================================
  // EVENT LISTENERS
  // ============================================================================

  /**
   * Attach event listeners to panel elements
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
    const globalToggle = document.getElementById('global-reminders-toggle');
    if (globalToggle) {
      globalToggle.addEventListener('change', (e) => {
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

    // Server settings button
    const serverSettingsBtn = document.getElementById('server-settings-btn');
    if (serverSettingsBtn) {
      serverSettingsBtn.addEventListener('click', () => {
        console.log('Server settings button clicked');
        this.showServerSettings();
      });
    }

    // Server settings specific listeners
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
  }

  /**
   * Server settings specific event listeners
   */
  attachServerSettingsListeners() {
    // Clear log button
    const clearLogBtn = document.getElementById('clear-log-btn');
    if (clearLogBtn) {
      clearLogBtn.addEventListener('click', () => {
        this.clearDebugLogs();
      });
    }

    // Test connection with logging
    const testConnectionBtn = document.getElementById('test-connection-btn');
    if (testConnectionBtn) {
      testConnectionBtn.addEventListener('click', async () => {
        this.addDebugLog('info', 'Manual connection test started');
        testConnectionBtn.disabled = true;
        
        const result = await this.testServerConnection();
        
        if (result.success) {
          this.addDebugLog('success', `Server test passed - Uptime: ${Math.round(result.data.uptime / 60)} minutes`);
          utils.showToast('Server connection successful!', 'success');
        } else {
          this.addDebugLog('error', `Server test failed: ${result.error}`);
          utils.showToast(`Connection failed: ${result.error}`, 'error');
        }
        
        testConnectionBtn.disabled = false;
        this.renderServerSettingsView();
        this.attachServerSettingsListeners();
      });
    }

    // Test notification with logging
    const testNotificationBtn = document.getElementById('test-notification-btn');
    if (testNotificationBtn) {
      testNotificationBtn.addEventListener('click', async () => {
        this.addDebugLog('info', 'Sending test notification');
        testNotificationBtn.disabled = true;
        
        const success = await this.sendTestNotification();
        
        if (success) {
          this.addDebugLog('success', 'Test notification sent successfully');
        } else {
          this.addDebugLog('error', 'Test notification failed');
        }
        
        setTimeout(() => {
          testNotificationBtn.disabled = false;
        }, 2000);
      });
    }

    // Reconnect with logging
    const reconnectBtn = document.getElementById('reconnect-server-btn');
    if (reconnectBtn) {
      reconnectBtn.addEventListener('click', async () => {
        this.addDebugLog('info', 'Manual reconnection started');
        reconnectBtn.disabled = true;
        
        utils.showToast('Reconnecting to server...', 'info');
        await this.setupPushNotifications();
        
        reconnectBtn.disabled = false;
      });
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

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
   * Get active system reminders count
   */
  getActiveSystemRemindersCount() {
    return Object.values(this.data.systemNotifications).filter(n => n.enabled).length;
  }

  /**
   * Get custom reminder type info for display
   */
  getCustomReminderTypeInfo(reminder) {
    // Simplified version - you can expand this based on your reminder types
    return {
      schedule: 'Custom reminder',
      timeWindow: null,
      times: null,
      next: null
    };
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
    // Add your reminder starting logic here
  }

  /**
   * Clear all active timers
   */
  clearAllTimers() {
    this.activeTimers.forEach(timer => clearTimeout(timer));
    this.intervalTimers.forEach(timer => clearInterval(timer));
    this.activeTimers.clear();
    this.intervalTimers.clear();
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
          <!-- Add notification details here -->
        </div>
      </div>
    `;
  }

  /**
   * Render custom reminder modal (simplified)
   */
  renderCustomReminderModal(isEdit = false) {
    const html = `
      <div class="panel-header">
        <button class="back-btn icon-btn" id="back-to-main" aria-label="Back">
          <i class="material-icons-round">arrow_back</i>
        </button>
        <h3>${isEdit ? 'Edit' : 'Add'} Custom Reminder</h3>
        <button class="close-panel icon-btn" aria-label="Close">
          <i class="material-icons-round">close</i>
        </button>
      </div>
      
      <div class="custom-reminder-form">
        <p>Custom reminder form coming soon...</p>
      </div>
    `;
    
    this.elements.remindersPanel.innerHTML = html;
  }
}
