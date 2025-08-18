/**
 * Simple Server Notifications Manager
 * Sends immediate notifications to server when local reminders trigger
 * Works with existing simple Pi server (no complex scheduling)
 */

class ServerNotifications {
  constructor() {
    this.serverUrl = 'https://192.168.0.147';
    this.isServerAvailable = false;
    this.pushSubscription = null;
    this.userId = null;
    this.notificationLogs = [];
    this.maxLogs = 100;
    
    this.init();
  }

  /**
   * Initialize server notifications
   */
  async init() {
    console.log('🔔 Initializing Simple ServerNotifications...');
    
    try {
      // Get user ID (reuse from RemindersManager or create new)
      this.userId = this.getUserId();
      
      // Check server availability
      await this.checkServerAvailability();
      
      // Set up push subscription if server is available
      if (this.isServerAvailable) {
        await this.setupPushSubscription();
        this.logNotification('success', 'Server notifications ready');
      } else {
        this.logNotification('warning', 'Server unavailable - will use local notifications only');
      }
      
      // Start periodic health checks
      this.startPeriodicHealthCheck();
      
      console.log('✅ Simple ServerNotifications initialized');
    } catch (error) {
      console.error('❌ ServerNotifications initialization failed:', error);
      this.logNotification('error', 'Initialization failed', error.message);
    }
  }

  /**
   * Get or create user ID (reuse from RemindersManager if available)
   */
  getUserId() {
    // Try to get from RemindersManager first
    if (window.remindersManager && window.remindersManager.userId) {
      return window.remindersManager.userId;
    }
    
    // Get from localStorage or create new
    let userId = localStorage.getItem('server_notifications_user_id');
    if (!userId) {
      userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('server_notifications_user_id', userId);
    }
    return userId;
  }

  /**
   * Check if server is available
   */
  async checkServerAvailability() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(`${this.serverUrl}/health`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const wasUnavailable = !this.isServerAvailable;
        this.isServerAvailable = true;
        
        if (wasUnavailable) {
          this.logNotification('success', 'Server connection restored');
          // Re-setup push subscription if server came back online
          await this.setupPushSubscription();
        }
        
        return true;
      } else {
        throw new Error(`Server responded with status: ${response.status}`);
      }
    } catch (error) {
      const wasAvailable = this.isServerAvailable;
      this.isServerAvailable = false;
      
      if (wasAvailable) {
        this.logNotification('warning', 'Server connection lost', error.message);
      }
      
      return false;
    }
  }

  /**
   * Set up push subscription (reuse from RemindersManager if available)
   */
  async setupPushSubscription() {
    try {
      // Try to reuse existing subscription from RemindersManager
      if (window.remindersManager && window.remindersManager.pushSubscription) {
        this.pushSubscription = window.remindersManager.pushSubscription;
        this.logNotification('info', 'Reusing existing push subscription');
        return true;
      }

      // Check if service worker is available
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push notifications not supported');
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Check for existing subscription
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        // Get VAPID public key from server
        const vapidResponse = await fetch(`${this.serverUrl}/vapid-public-key`);
        if (!vapidResponse.ok) {
          throw new Error('Failed to get VAPID key from server');
        }
        
        const { publicKey } = await vapidResponse.json();

        // Create new subscription
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlBase64ToUint8Array(publicKey)
        });
      }

      this.pushSubscription = subscription;

      // Send subscription to server
      await this.sendSubscriptionToServer();
      
      this.logNotification('success', 'Push subscription setup complete');
      return true;

    } catch (error) {
      this.logNotification('error', 'Push subscription setup failed', error.message);
      return false;
    }
  }

  /**
   * Send subscription to server
   */
  async sendSubscriptionToServer() {
    if (!this.pushSubscription) {
      throw new Error('No push subscription available');
    }

    const response = await fetch(`${this.serverUrl}/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subscription: this.pushSubscription,
        userId: this.userId
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to send subscription: ${errorData.error || 'Unknown error'}`);
    }

    this.logNotification('success', 'Subscription registered with server');
  }

  /**
   * Send immediate notification through server
   * This is the main method called when local reminders trigger
   */
  async sendServerNotification(title, body, data = {}) {
    if (!this.isServerAvailable) {
      this.logNotification('warning', 'Cannot send server notification: server unavailable');
      return false;
    }

    try {
      this.logNotification('info', `Sending notification: ${title}`);

      const response = await fetch(`${this.serverUrl}/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: this.userId,
          title,
          body,
          data: {
            ...data,
            source: 'server',
            timestamp: Date.now()
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        this.logNotification('success', `Server notification sent: ${title}`, {
          response: result,
          title,
          body
        });
        return true;
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Unknown error');
      }

    } catch (error) {
      this.logNotification('error', `Server notification failed: ${title}`, {
        error: error.message,
        title,
        body
      });
      return false;
    }
  }

  /**
   * Send both local and server notifications
   * This is the main method called by RemindersManager when reminders trigger
   */
  async sendDualNotification(title, body, options = {}) {
    const results = {
      local: false,
      server: false,
      fallbackUsed: false
    };

    try {
      this.logNotification('info', `Triggering dual notification: ${title}`);

      // Always attempt server notification first
      if (this.isServerAvailable) {
        results.server = await this.sendServerNotification(title, body, options.data);
      }

      // Send local notification as well (or as fallback)
      if (this.shouldSendLocalNotification(results.server, options)) {
        results.local = this.sendLocalNotification(title, body, options);
        
        if (!results.server && results.local) {
          results.fallbackUsed = true;
          this.logNotification('info', 'Local notification used as fallback');
        }
      }

      // Log final result
      const resultSummary = [];
      if (results.server) resultSummary.push('server');
      if (results.local) resultSummary.push('local');
      if (results.fallbackUsed) resultSummary.push('(fallback)');
      
      this.logNotification('success', `Notification sent via: ${resultSummary.join(', ')}`, {
        title,
        serverSuccess: results.server,
        localSuccess: results.local,
        fallbackUsed: results.fallbackUsed
      });

      return results;

    } catch (error) {
      this.logNotification('error', 'Dual notification failed', {
        error: error.message,
        title
      });
      
      // Emergency fallback to local notification
      results.local = this.sendLocalNotification(title, body, options);
      results.fallbackUsed = true;
      
      return results;
    }
  }

  /**
   * Determine if local notification should be sent
   */
  shouldSendLocalNotification(serverSuccess, options) {
    // Always send local on mobile devices (better reliability)
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Send local if:
    // 1. Server failed (fallback)
    // 2. On mobile devices (dual delivery)
    // 3. Explicitly requested in options
    return !serverSuccess || isMobile || options.forceLocal;
  }

  /**
   * Send local notification
   */
  sendLocalNotification(title, body, options = {}) {
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(title, {
          body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: options.tag || 'health-tracker',
          requireInteraction: false,
          data: {
            ...options.data,
            source: 'local',
            timestamp: Date.now()
          }
        });

        // Auto-close after 10 seconds
        setTimeout(() => {
          notification.close();
        }, 10000);

        this.logNotification('success', `Local notification sent: ${title}`);
        return true;
      } else {
        this.logNotification('warning', 'Local notifications not available or permission denied');
      }
    } catch (error) {
      this.logNotification('error', 'Local notification failed', error.message);
    }
    return false;
  }

  /**
   * Test server connectivity and notifications
   */
  async testServerNotifications() {
    this.logNotification('info', 'Testing server notifications...');
    
    const testTitle = '🧪 Server Test';
    const testBody = `Notification test from Health Tracker - ${new Date().toLocaleTimeString()}`;
    
    const result = await this.sendDualNotification(testTitle, testBody, {
      data: { type: 'test' },
      forceLocal: true // Ensure both local and server are attempted
    });
    
    return result;
  }

  /**
   * Log notification events
   */
  logNotification(type, message, details = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: type, // 'info', 'success', 'warning', 'error'
      message: message,
      details: details
    };

    this.notificationLogs.unshift(logEntry); // Add to beginning
    
    // Keep only recent logs
    if (this.notificationLogs.length > this.maxLogs) {
      this.notificationLogs = this.notificationLogs.slice(0, this.maxLogs);
    }

    // Save to localStorage
    this.saveLogsToStorage();
    
    // Log to console
    console.log(`[ServerNotifications] ${type.toUpperCase()}: ${message}`, details || '');
    
    // Log to ServerSettingsManager if available
    if (window.serverSettingsManager) {
      window.serverSettingsManager.addSystemLog(type, `[Notifications] ${message}`, details);
    }
  }

  /**
   * Save logs to localStorage
   */
  saveLogsToStorage() {
    try {
      localStorage.setItem('server_notifications_logs', JSON.stringify(this.notificationLogs.slice(0, 50)));
    } catch (error) {
      console.warn('Failed to save notification logs:', error);
    }
  }

  /**
   * Load logs from localStorage
   */
  loadLogsFromStorage() {
    try {
      const stored = localStorage.getItem('server_notifications_logs');
      if (stored) {
        this.notificationLogs = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load notification logs:', error);
      this.notificationLogs = [];
    }
  }

  /**
   * Get notification logs for display
   */
  getNotificationLogs() {
    return this.notificationLogs;
  }

  /**
   * Clear notification logs
   */
  clearNotificationLogs() {
    this.notificationLogs = [];
    this.saveLogsToStorage();
    this.logNotification('info', 'Notification logs cleared');
  }

  /**
   * Periodic server health check (every 5 minutes)
   */
  startPeriodicHealthCheck() {
    setInterval(async () => {
      await this.checkServerAvailability();
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Get server status summary
   */
  getStatus() {
    return {
      serverAvailable: this.isServerAvailable,
      pushSubscriptionActive: !!this.pushSubscription,
      userId: this.userId,
      serverUrl: this.serverUrl,
      totalLogs: this.notificationLogs.length,
      lastCheck: new Date().toISOString()
    };
  }

  /**
   * Helper function to convert VAPID key
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

// Initialize and export
let serverNotifications = null;

// Wait for DOM and other managers to be ready
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    try {
      serverNotifications = new ServerNotifications();
      window.serverNotifications = serverNotifications;
      
      // Load existing logs
      serverNotifications.loadLogsFromStorage();
      
      console.log('✅ Simple ServerNotifications ready');
    } catch (error) {
      console.error('❌ ServerNotifications initialization failed:', error);
    }
  }, 2000); // Wait 2 seconds for other systems to initialize
});

// Export for global access
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ServerNotifications;
}