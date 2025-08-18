/**
 * Server Settings Manager
 * Handles server connection status, testing, and logging
 * For Health Tracker App - Raspberry Pi Server Integration
 */

class ServerSettingsManager {
  constructor() {
    this.serverUrl = 'https://192.168.0.147';
    this.connectionStatus = 'unknown';
    this.lastConnectionTime = null;
    this.pingLatency = null;
    this.subscriptionStatus = 'unknown';
    this.systemLogs = [];
    this.maxLogs = 50; // Keep last 50 log entries
    
    // Initialize
    this.init();
  }

  /**
   * Initialize server settings manager
   */
  async init() {
    console.log('Initializing ServerSettingsManager...');
    this.loadStoredData();
    await this.checkServerConnection();
    this.startPeriodicConnectionCheck();
  }

  /**
   * Load stored data from localStorage
   */
  loadStoredData() {
    try {
      const stored = localStorage.getItem('server_settings_data');
      if (stored) {
        const data = JSON.parse(stored);
        this.systemLogs = data.systemLogs || [];
        this.lastConnectionTime = data.lastConnectionTime;
      }
    } catch (error) {
      console.error('Failed to load server settings data:', error);
      this.addSystemLog('error', 'Failed to load stored server data');
    }
  }

  /**
   * Save data to localStorage
   */
  saveData() {
    try {
      const data = {
        systemLogs: this.systemLogs.slice(-this.maxLogs), // Keep only recent logs
        lastConnectionTime: this.lastConnectionTime
      };
      localStorage.setItem('server_settings_data', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save server settings data:', error);
    }
  }

  /**
   * Add entry to system log
   */
  addSystemLog(type, message, details = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: type, // 'info', 'success', 'warning', 'error'
      message: message,
      details: details
    };

    this.systemLogs.unshift(logEntry); // Add to beginning
    
    // Keep only recent logs
    if (this.systemLogs.length > this.maxLogs) {
      this.systemLogs = this.systemLogs.slice(0, this.maxLogs);
    }

    this.saveData();
    this.updateLogsDisplay();
    
    console.log(`[ServerSettings] ${type.toUpperCase()}: ${message}`, details || '');
  }

  /**
   * Check server connection and update status
   */
  async checkServerConnection() {
    const startTime = Date.now();
    
    try {
      this.addSystemLog('info', 'Checking server connection...');
      
      // Test server health endpoint
      const response = await fetch(`${this.serverUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (response.ok) {
        const healthData = await response.json();
        this.pingLatency = Date.now() - startTime;
        this.connectionStatus = 'connected';
        this.lastConnectionTime = new Date().toISOString();
        
        this.addSystemLog('success', `Server connected (${this.pingLatency}ms)`, {
          serverStatus: healthData.status,
          serverUptime: healthData.uptime,
          serverMemory: healthData.memory
        });

        // Check subscription status
        await this.checkSubscriptionStatus();

      } else {
        throw new Error(`Server responded with status: ${response.status}`);
      }

    } catch (error) {
      this.connectionStatus = 'disconnected';
      this.pingLatency = null;
      this.addSystemLog('error', 'Server connection failed', {
        error: error.message,
        url: this.serverUrl
      });
    }

    this.updateConnectionDisplay();
  }

  /**
   * Check if push subscription is active
   */
  async checkSubscriptionStatus() {
    try {
      if (!window.remindersManager || !window.remindersManager.pushSubscription) {
        this.subscriptionStatus = 'not_subscribed';
        this.addSystemLog('warning', 'Push subscription not found');
        return;
      }

      // Test if subscription is still valid by trying to get VAPID key
      const response = await fetch(`${this.serverUrl}/vapid-public-key`);
      if (response.ok) {
        this.subscriptionStatus = 'active';
        this.addSystemLog('success', 'Push subscription is active');
      } else {
        this.subscriptionStatus = 'error';
        this.addSystemLog('error', 'Push subscription validation failed');
      }

    } catch (error) {
      this.subscriptionStatus = 'error';
      this.addSystemLog('error', 'Subscription check failed', { error: error.message });
    }
  }

  /**
   * Send test notification
   */
  async sendTestNotification() {
    try {
      this.addSystemLog('info', 'Sending test notification...');

      if (!window.remindersManager || !window.remindersManager.userId) {
        throw new Error('RemindersManager not available or user ID missing');
      }

      const testData = {
        userId: window.remindersManager.userId,
        title: '🧪 Test Notification',
        body: `Server test from Health Tracker - ${new Date().toLocaleTimeString()}`,
        data: {
          type: 'test',
          timestamp: Date.now()
        }
      };

      const response = await fetch(`${this.serverUrl}/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testData)
      });

      if (response.ok) {
        const result = await response.json();
        this.addSystemLog('success', 'Test notification sent successfully', {
          userId: testData.userId,
          response: result
        });
        
        // Show local confirmation
        if (window.utils && window.utils.showToast) {
          window.utils.showToast('Test notification sent! Check your notifications.', 'success');
        }

      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Server error: ${response.status} - ${errorData.error || 'Unknown error'}`);
      }

    } catch (error) {
      this.addSystemLog('error', 'Test notification failed', {
        error: error.message,
        userId: window.remindersManager?.userId || 'unknown'
      });
      
      if (window.utils && window.utils.showToast) {
        window.utils.showToast(`Test notification failed: ${error.message}`, 'error');
      }
    }
  }

  /**
   * Get server statistics
   */
  async getServerStats() {
    try {
      this.addSystemLog('info', 'Fetching server statistics...');

      const response = await fetch(`${this.serverUrl}/stats`);
      if (response.ok) {
        const stats = await response.json();
        this.addSystemLog('success', 'Server statistics retrieved', stats);
        return stats;
      } else {
        throw new Error(`Failed to fetch stats: ${response.status}`);
      }

    } catch (error) {
      this.addSystemLog('error', 'Failed to fetch server statistics', { error: error.message });
      return null;
    }
  }

  /**
   * Clear system logs
   */
  clearSystemLogs() {
    this.systemLogs = [];
    this.saveData();
    this.updateLogsDisplay();
    this.addSystemLog('info', 'System logs cleared');
  }

  /**
   * Start periodic connection check (every 5 minutes)
   */
  startPeriodicConnectionCheck() {
    setInterval(() => {
      this.checkServerConnection();
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Update connection display in the UI
   */
  updateConnectionDisplay() {
    const statusElement = document.getElementById('server-connection-status');
    const urlElement = document.getElementById('server-url-display');
    const lastConnElement = document.getElementById('server-last-connection');
    const pingElement = document.getElementById('server-ping-latency');
    const subscriptionElement = document.getElementById('server-subscription-status');

    if (statusElement) {
      statusElement.className = `connection-status ${this.connectionStatus}`;
      statusElement.textContent = this.getConnectionStatusText();
    }

    if (urlElement) {
      urlElement.textContent = this.serverUrl;
    }

    if (lastConnElement) {
      lastConnElement.textContent = this.lastConnectionTime 
        ? new Date(this.lastConnectionTime).toLocaleString()
        : 'Never';
    }

    if (pingElement) {
      pingElement.textContent = this.pingLatency 
        ? `${this.pingLatency}ms`
        : 'N/A';
    }

    if (subscriptionElement) {
      subscriptionElement.className = `subscription-status ${this.subscriptionStatus}`;
      subscriptionElement.textContent = this.getSubscriptionStatusText();
    }
  }

  /**
   * Update logs display in the UI
   */
  updateLogsDisplay() {
    const logsContainer = document.getElementById('system-logs-container');
    if (!logsContainer) return;

    if (this.systemLogs.length === 0) {
      logsContainer.innerHTML = '<div class="no-logs">No system logs available</div>';
      return;
    }

    const logsHtml = this.systemLogs.map(log => {
      const time = new Date(log.timestamp).toLocaleString();
      const detailsHtml = log.details 
        ? `<div class="log-details">${JSON.stringify(log.details, null, 2)}</div>`
        : '';

      return `
        <div class="log-entry log-${log.type}">
          <div class="log-header">
            <span class="log-type">${log.type.toUpperCase()}</span>
            <span class="log-time">${time}</span>
          </div>
          <div class="log-message">${log.message}</div>
          ${detailsHtml}
        </div>
      `;
    }).join('');

    logsContainer.innerHTML = logsHtml;
  }

  /**
   * Get human-readable connection status
   */
  getConnectionStatusText() {
    switch (this.connectionStatus) {
      case 'connected': return 'Connected';
      case 'disconnected': return 'Disconnected';
      case 'unknown': return 'Checking...';
      default: return 'Unknown';
    }
  }

  /**
   * Get human-readable subscription status
   */
  getSubscriptionStatusText() {
    switch (this.subscriptionStatus) {
      case 'active': return 'Active';
      case 'not_subscribed': return 'Not Subscribed';
      case 'error': return 'Error';
      case 'unknown': return 'Checking...';
      default: return 'Unknown';
    }
  }

  /**
   * Render the server settings panel
   */
  renderPanel() {
    const panel = document.getElementById('server-settings-panel');
    if (!panel) {
      console.error('Server settings panel not found');
      return;
    }

    const html = `
      <div class="panel-header">
        <h3>🖥️ Server Settings</h3>
        <button class="close-panel icon-btn" aria-label="Close">
          <i class="material-icons-round">close</i>
        </button>
      </div>

      <!-- Connection Status Section -->
      <div class="server-section">
        <h4>Connection Status</h4>
        <div class="connection-info">
          <div class="info-row">
            <span class="info-label">Status:</span>
            <span id="server-connection-status" class="connection-status ${this.connectionStatus}">
              ${this.getConnectionStatusText()}
            </span>
          </div>
          <div class="info-row">
            <span class="info-label">Server URL:</span>
            <span id="server-url-display" class="server-url">${this.serverUrl}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Last Connected:</span>
            <span id="server-last-connection">${this.lastConnectionTime ? new Date(this.lastConnectionTime).toLocaleString() : 'Never'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Latency:</span>
            <span id="server-ping-latency">${this.pingLatency ? `${this.pingLatency}ms` : 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Push Subscription:</span>
            <span id="server-subscription-status" class="subscription-status ${this.subscriptionStatus}">
              ${this.getSubscriptionStatusText()}
            </span>
          </div>
        </div>
        
        <div class="btn-group">
          <button id="refresh-connection" class="action-btn neutral">
            <i class="material-icons-round">refresh</i> Refresh Connection
          </button>
        </div>
      </div>

      <!-- Test Notification Section -->
      <div class="server-section">
        <h4>Test Notification</h4>
        <p class="section-description">Send a test notification to verify server communication</p>
        <div class="btn-group">
          <button id="send-test-notification" class="action-btn water">
            <i class="material-icons-round">send</i> Send Test
          </button>
        </div>
      </div>

      <!-- Server Statistics Section -->
      <div class="server-section">
        <h4>Server Statistics</h4>
        <div id="server-stats-container">
          <button id="fetch-server-stats" class="action-btn neutral">
            <i class="material-icons-round">analytics</i> Fetch Stats
          </button>
        </div>
      </div>

      <!-- System Logs Section -->
      <div class="server-section">
        <div class="section-header">
          <h4>System Logs</h4>
          <button id="clear-system-logs" class="icon-btn danger-text">
            <i class="material-icons-round">clear_all</i>
          </button>
        </div>
        <div id="system-logs-container" class="logs-container">
          <!-- Logs will be populated here -->
        </div>
      </div>
    `;

    panel.innerHTML = html;
    this.attachEventListeners();
    this.updateConnectionDisplay();
    this.updateLogsDisplay();
  }

  /**
   * Attach event listeners to server settings panel
   */
  attachEventListeners() {
    // Refresh connection button
    const refreshBtn = document.getElementById('refresh-connection');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="material-icons-round">hourglass_empty</i> Checking...';
        
        this.checkServerConnection().finally(() => {
          refreshBtn.disabled = false;
          refreshBtn.innerHTML = '<i class="material-icons-round">refresh</i> Refresh Connection';
        });
      });
    }

    // Send test notification button
    const testBtn = document.getElementById('send-test-notification');
    if (testBtn) {
      testBtn.addEventListener('click', () => {
        testBtn.disabled = true;
        testBtn.innerHTML = '<i class="material-icons-round">hourglass_empty</i> Sending...';
        
        this.sendTestNotification().finally(() => {
          testBtn.disabled = false;
          testBtn.innerHTML = '<i class="material-icons-round">send</i> Send Test';
        });
      });
    }

    // Fetch server stats button
    const statsBtn = document.getElementById('fetch-server-stats');
    if (statsBtn) {
      statsBtn.addEventListener('click', async () => {
        statsBtn.disabled = true;
        statsBtn.innerHTML = '<i class="material-icons-round">hourglass_empty</i> Fetching...';
        
        const stats = await this.getServerStats();
        
        if (stats) {
          const statsContainer = document.getElementById('server-stats-container');
          statsContainer.innerHTML = `
            <div class="stats-display">
              <div class="stat-item">
                <span class="stat-label">Active Subscriptions:</span>
                <span class="stat-value">${stats.activeSubscriptions || 0}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Notifications (24h):</span>
                <span class="stat-value">${stats.notificationsLast24h || 0}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Successful (24h):</span>
                <span class="stat-value">${stats.successfulLast24h || 0}</span>
              </div>
              <button id="fetch-server-stats" class="action-btn neutral">
                <i class="material-icons-round">refresh</i> Refresh Stats
              </button>
            </div>
          `;
          // Re-attach event listener for the new button
          this.attachEventListeners();
        } else {
          statsBtn.disabled = false;
          statsBtn.innerHTML = '<i class="material-icons-round">analytics</i> Fetch Stats';
        }
      });
    }

    // Clear logs button
    const clearLogsBtn = document.getElementById('clear-system-logs');
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all system logs?')) {
          this.clearSystemLogs();
        }
      });
    }
  }

  /**
   * Helper function for VAPID key conversion (used by RemindersManager)
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
}

// Initialize server settings manager when DOM is loaded
let serverSettingsManager = null;

document.addEventListener('DOMContentLoaded', () => {
  // Wait for reminders manager to be ready
  setTimeout(() => {
    try {
      serverSettingsManager = new ServerSettingsManager();
      window.serverSettingsManager = serverSettingsManager;
      console.log('✅ ServerSettingsManager initialized');
    } catch (error) {
      console.error('❌ Failed to initialize ServerSettingsManager:', error);
    }
  }, 1000);
});

// Export for global access
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ServerSettingsManager;
}