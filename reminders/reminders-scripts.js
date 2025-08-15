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
 * - REAL-TIME DEBUG LOGGING: Visual debugging interface for connection issues
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
    
    // NEW: Debug logging system
    this.debugLogs = [];
    this.maxLogs = 50; // Keep last 50 log entries
    
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
    
    // Initialize data
    this.loadData();
    
    // Get DOM elements
    this.elements = {
      remindersPanel: document.getElementById('reminders-panel'),
      bellIcon: document.getElementById('reminders-bell-icon')
    };
    
    // Migrate old notification settings
    this.migrateOldSettings();
    
    console.log('🔄 [RemindersManager] Constructor - calling setupPushNotifications');
    
    // Initialize server notifications
    this.setupPushNotifications();
  }

  // ============================================================================
  // NEW: DEBUG LOGGING SYSTEM
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
  // NEW: SERVER NOTIFICATION METHODS
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
   * Setup push notifications (runs once on app load)
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

  /**
   * Show server settings
   */
  showServerSettings() {
    this.currentView = 'server-settings';
    this.renderPanel();
  }

  // ============================================================================
  // DATA MANAGEMENT
  // ============================================================================

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
        this.data.customReminders = this.data.customReminders || [];
      } else {
        this.data = { ...this.defaultData };
      }
      console.log('Loaded reminders data:', this.data);
    } catch (error) {
      console.error('Error loading reminders data:', error);
      this.data = { ...this.defaultData };
    }
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
   * Migrate old notification settings to new system
   */
  migrateOldSettings() {
    let migrated = false;
    
    Object.entries(this.legacyNotificationKeys).forEach(([key, storageKey]) => {
      const oldValue = localStorage.getItem(storageKey);
      if (oldValue !== null) {
        if (key === 'global') {
          this.data.globalEnabled = oldValue === 'true';
        } else if (key === 'waterAlert') {
          this.data.systemNotifications.waterAlert.enabled = oldValue === 'true';
        } else if (key === 'waterInterval') {
          this.data.systemNotifications.waterInterval.enabled = oldValue === 'true';
        } else if (key === 'proteinAlert') {
          this.data.systemNotifications.proteinAlert.enabled = oldValue === 'true';
        }
        
        localStorage.removeItem(storageKey);
        migrated = true;
      }
    });
    
    if (migrated) {
      console.log('Migrated old notification settings');
      this.saveData();
    }
  }

  // ============================================================================
  // UI MANAGEMENT
  // ============================================================================

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
    
    // Open reminders panel
    this.elements.remindersPanel.classList.add('active');
    
    // Update bell icon state
    this.updateBellIcon();
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
   * Navigate back to main view
   */
  backToMain() {
    this.currentView = 'main';
    this.editingReminderId = null;
    this.renderPanel();
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

      <!-- NEW: Debug Log Section -->
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

  /**
   * Attach server settings specific event listeners
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
  // REMINDER FUNCTIONALITY
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
   * Update bell icon based on active reminders
   */
  updateBellIcon() {
    if (!this.elements.bellIcon) return;
    
    const hasActiveReminders = this.data.globalEnabled && (
      Object.values(this.data.systemNotifications).some(n => n.enabled) ||
      this.data.customReminders.some(r => r.enabled)
    );
    
    if (hasActiveReminders) {
      this.elements.bellIcon.classList.add('has-active-reminders');
    } else {
      this.elements.bellIcon.classList.remove('has-active-reminders');
    }
  }

  /**
   * Get count of active system reminders
   */
  getActiveSystemRemindersCount() {
    return Object.values(this.data.systemNotifications).filter(n => n.enabled).length;
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
   * UPDATED: Trigger goal check alert with server notification
   */
  triggerGoalCheckAlert(type) {
    const notification = this.data.systemNotifications[type];
    if (!notification || !notification.enabled) return;

    const reminderType = type.replace('Alert', '');
    const message = notification.message || `Time to check your ${reminderType} goal!`;

    // Local notification
    if (Notification.permission === 'granted') {
      new Notification('Health Tracker', {
        body: message,
        icon: '/icons/icon-192.png',
        tag: `goal-alert-${type}`
      });
    }

    // NEW: Also send via server
    this.sendServerNotification(
      'Health Tracker',
      message,
      { type: 'goal-alert', reminderType: type }
    );

    console.log(`Goal alert triggered: ${type}`);
  }

  /**
   * UPDATED: Trigger interval reminder with server notification
   */
  triggerIntervalReminder(type) {
    const notification = this.data.systemNotifications[type];
    if (!notification || !notification.enabled) return;

    const reminderType = type.replace('Interval', '');
    const message = notification.message || `Time for your ${reminderType} reminder!`;

    // Local notification
    if (Notification.permission === 'granted') {
      new Notification('Health Tracker', {
        body: message,
        icon: '/icons/icon-192.png',
        tag: `interval-reminder-${type}`
      });
    }

    // NEW: Also send via server
    this.sendServerNotification(
      'Health Tracker',
      message,
      { type: 'interval-reminder', reminderType: type }
    );

    console.log(`Interval reminder triggered: ${type}`);
  }

  // ============================================================================
  // PLACEHOLDER METHODS (Add your existing reminder logic here)
  // ============================================================================

  /**
   * Show system reminders view
   */
  showSystemReminders() {
    this.currentView = 'system';
    this.renderPanel();
  }

  /**
   * Render system reminders view (placeholder)
   */
  renderSystemRemindersView() {
    // Add your existing system reminders view code here
    this.elements.remindersPanel.innerHTML = `
      <div class="panel-header">
        <button class="back-btn icon-btn" id="back-to-main" aria-label="Back">
          <i class="material-icons-round">arrow_back</i>
        </button>
        <h3>System Reminders</h3>
        <button class="close-panel icon-btn" aria-label="Close">
          <i class="material-icons-round">close</i>
        </button>
      </div>
      <div style="padding: 20px; text-align: center; color: var(--text-secondary);">
        System reminders configuration will be implemented here.
      </div>
    `;
  }

  /**
   * Render custom reminders list (placeholder)
   */
  renderCustomRemindersList() {
    if (this.data.customReminders.length === 0) {
      return '<div style="text-align: center; color: var(--text-secondary); padding: 20px;">No custom reminders yet</div>';
    }
    
    // Add your existing custom reminders list code here
    return this.data.customReminders.map(reminder => `
      <div class="custom-reminder-item">
        <div class="reminder-title">${reminder.title}</div>
        <div class="reminder-schedule">${reminder.type}</div>
      </div>
    `).join('');
  }

  /**
   * Render custom reminder modal (placeholder)
   */
  renderCustomReminderModal(isEdit) {
    // Add your existing custom reminder form code here
    this.elements.remindersPanel.innerHTML = `
      <div class="panel-header">
        <button class="back-btn icon-btn" id="back-to-main" aria-label="Back">
          <i class="material-icons-round">arrow_back</i>
        </button>
        <h3>${isEdit ? 'Edit' : 'Add'} Custom Reminder</h3>
        <button class="close-panel icon-btn" aria-label="Close">
          <i class="material-icons-round">close</i>
        </button>
      </div>
      <div style="padding: 20px; text-align: center; color: var(--text-secondary);">
        Custom reminder form will be implemented here.
      </div>
    `;
  }

  /**
   * Attach main view listeners (placeholder)
   */
  attachMainViewListeners() {
    // Add your existing main view event listeners here
  }

  /**
   * Attach system reminders listeners (placeholder)
   */
  attachSystemRemindersListeners() {
    // Add your existing system reminders event listeners here
  }

  /**
   * Attach custom reminder form listeners (placeholder)
   */
  attachCustomReminderFormListeners() {
    // Add your existing custom reminder form event listeners here
  }

  /**
   * Schedule system notification (placeholder)
   */
  scheduleSystemNotification(type) {
    // Add your existing system notification scheduling logic here
    console.log(`Scheduling system notification: ${type}`);
  }

  /**
   * Schedule custom reminder (placeholder)
   */
  scheduleCustomReminder(reminder) {
    // Add your existing custom reminder scheduling logic here
    console.log(`Scheduling custom reminder: ${reminder.title}`);
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RemindersManager;
}
