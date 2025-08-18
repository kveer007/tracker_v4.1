/**
 * Health Tracker PWA Service Worker - Complete Version
 * Includes iOS-optimized push notifications and background support
 */

// Cache name (Updated version)
const CACHE_NAME = "daily-tracker-v2.2";

// Files to cache
const FILES_TO_CACHE = [
  '/',
  'index.html',
  'core/core-styles.css',
  'core/core-scripts.js',
  'core/ui.js',
  'core/server-settings.js',
  'core/server-settings-styles.css',
  'trackers/trackers-scripts.js',
  'trackers/trackers-styles.css',
  'workouts/workouts-scripts.js',
  'workouts/workouts-styles.css',
  'habits/habits-scripts.js',
  'habits/habits-styles.css',
  'reminders/reminders-scripts.js',
  'reminders/reminders-styles.css',
  'reminders/server-notifications.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/icon?family=Material+Icons+Round'
];

// ============================================================================
// INSTALLATION & ACTIVATION
// ============================================================================

// Enhanced install event for iOS
self.addEventListener('install', (event) => {
  console.log('📦 [SW] Installing service worker...');
  
  // Skip waiting to ensure immediate activation
  self.skipWaiting();
  
  // Pre-cache critical resources
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-caching app shell and content');
        return cache.addAll(FILES_TO_CACHE);
      })
      .catch((error) => {
        console.error('[SW] Precaching failed:', error);
      })
  );
});

// Enhanced activate event for iOS
self.addEventListener('activate', (event) => {
  console.log('🚀 [SW] Activating service worker...');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((keyList) => {
        return Promise.all(keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          }
        }));
      }),
      
      // Claim all clients immediately
      self.clients.claim().then(() => {
        console.log('[SW] Service worker claimed all clients');
      })
    ])
  );
});

// ============================================================================
// FETCH HANDLING (EXISTING FUNCTIONALITY)
// ============================================================================

// Fetch event - Serve cached content when offline
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          if (response) {
            // Return cached response
            return response;
          }
          
          // Fetch from network
          return fetch(event.request).then((response) => {
            // Don't cache if not a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone the response for caching
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          });
        })
        .catch(() => {
          // Return offline page for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
        })
    );
  }
});

// ============================================================================
// PUSH NOTIFICATIONS - iOS OPTIMIZED
// ============================================================================

// Handle push notifications from server - OPTIMIZED FOR iOS
self.addEventListener('push', (event) => {
  console.log('🔔 [SW] Push notification received from server!', event);
  
  let notificationData = {
    title: 'Health Tracker',
    body: 'Time to check your progress!',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'health-tracker-reminder',
    requireInteraction: true, // CRITICAL for iOS - keeps notification visible
    silent: false,
    renotify: true, // Allow re-showing same tag
    timestamp: Date.now(),
    data: {
      source: 'server',
      timestamp: Date.now()
    }
  };

  // Parse notification data from server
  if (event.data) {
    try {
      const pushData = event.data.json();
      notificationData = { ...notificationData, ...pushData };
      
      // Ensure required iOS properties
      notificationData.requireInteraction = true;
      notificationData.timestamp = Date.now();
      
    } catch (e) {
      console.warn('[SW] Failed to parse push data as JSON, using as text');
      notificationData.body = event.data.text() || notificationData.body;
    }
  }

  // iOS-specific optimizations
  const isIOS = /iPad|iPhone|iPod/.test(self.navigator.userAgent);
  if (isIOS) {
    // iOS requires these settings for background notifications
    notificationData.requireInteraction = true;
    notificationData.silent = false;
    
    // Remove actions on iOS (not supported)
    delete notificationData.actions;
    
    // Ensure badge is set for iOS
    notificationData.badge = notificationData.badge || '/icons/icon-192.png';
    
    console.log('[SW] iOS device detected - using iOS-optimized notification settings');
  }

  // CRITICAL: Use event.waitUntil to keep service worker alive
  event.waitUntil(
    showNotificationWithRetry(notificationData.title, notificationData)
      .then(() => {
        console.log('✅ [SW] Notification shown successfully');
        
        // IMPORTANT: Keep service worker alive longer on iOS
        if (isIOS) {
          return new Promise(resolve => setTimeout(resolve, 5000));
        }
      })
      .catch(error => {
        console.error('❌ [SW] Failed to show notification:', error);
        
        // Fallback: Try with minimal options
        return self.registration.showNotification('Health Tracker', {
          body: 'New reminder from Health Tracker',
          icon: '/icons/icon-192.png',
          requireInteraction: true,
          tag: 'health-tracker-fallback'
        });
      })
  );
});

// ============================================================================
// NOTIFICATION RETRY MECHANISM
// ============================================================================

async function showNotificationWithRetry(title, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[SW] Notification attempt ${attempt}/${maxRetries}`);
      
      // Add attempt info to options for debugging
      const optionsWithAttempt = {
        ...options,
        data: {
          ...options.data,
          attempt: attempt,
          retries: maxRetries
        }
      };
      
      await self.registration.showNotification(title, optionsWithAttempt);
      console.log(`✅ [SW] Notification shown on attempt ${attempt}`);
      return; // Success!
      
    } catch (error) {
      console.warn(`⚠️ [SW] Notification attempt ${attempt} failed:`, error);
      
      if (attempt === maxRetries) {
        throw error; // Final attempt failed
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

// ============================================================================
// NOTIFICATION CLICK HANDLING - iOS OPTIMIZED
// ============================================================================

self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ [SW] Notification clicked', event.notification);
  
  // Close the notification
  event.notification.close();
  
  // Extract data from notification
  const notificationData = event.notification.data || {};
  const action = event.action; // Will be undefined for main notification click
  
  console.log('[SW] Notification data:', notificationData);
  console.log('[SW] Action clicked:', action);
  
  // CRITICAL for iOS: Use event.waitUntil to keep service worker alive
  event.waitUntil(
    handleNotificationClick(action, notificationData)
      .then(() => {
        console.log('✅ [SW] Notification click handled successfully');
      })
      .catch(error => {
        console.error('❌ [SW] Error handling notification click:', error);
      })
  );
});

async function handleNotificationClick(action, data) {
  // Get all client windows
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });
  
  console.log(`[SW] Found ${clients.length} client windows`);
  
  // Try to focus existing window first
  for (const client of clients) {
    if (client.url.includes(self.location.origin)) {
      console.log('[SW] Focusing existing window:', client.url);
      
      // Send message to client about notification click
      client.postMessage({
        type: 'notification-click',
        action: action,
        data: data,
        timestamp: Date.now()
      });
      
      // Focus the window
      if ('focus' in client) {
        return client.focus();
      }
    }
  }
  
  // No existing window found, open new one
  console.log('[SW] Opening new window');
  
  let url = '/';
  
  // Customize URL based on notification data
  if (data.type === 'goal-alert' || data.type === 'interval-reminder') {
    url += '?reminder=true';
  } else if (data.type === 'custom-reminder') {
    url += '?custom=true';
  }
  
  if ('openWindow' in self.clients) {
    return self.clients.openWindow(url);
  }
}

// ============================================================================
// BACKGROUND SYNC - iOS SUPPORT
// ============================================================================

self.addEventListener('sync', (event) => {
  console.log('🔄 [SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'health-tracker-sync') {
    event.waitUntil(handleBackgroundSync());
  }
});

async function handleBackgroundSync() {
  try {
    console.log('[SW] Performing background sync...');
    
    // Check if we can communicate with the server
    const response = await fetch('/health', {
      method: 'GET',
      cache: 'no-cache'
    });
    
    if (response.ok) {
      console.log('✅ [SW] Background sync successful');
      
      // Send message to clients about successful sync
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'background-sync',
          success: true,
          timestamp: Date.now()
        });
      });
    }
    
  } catch (error) {
    console.warn('⚠️ [SW] Background sync failed:', error);
  }
}

// ============================================================================
// PUSH SUBSCRIPTION MANAGEMENT
// ============================================================================

self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('🔄 [SW] Push subscription changed');
  
  event.waitUntil(
    handlePushSubscriptionChange()
      .then(() => {
        console.log('✅ [SW] Push subscription updated successfully');
      })
      .catch(error => {
        console.error('❌ [SW] Failed to update push subscription:', error);
      })
  );
});

async function handlePushSubscriptionChange() {
  try {
    // Get new subscription
    const subscription = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: await getVapidPublicKey()
    });
    
    // Send new subscription to server
    await fetch('https://192.168.0.147/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subscription: subscription,
        userId: await getUserId()
      })
    });
    
    console.log('[SW] New push subscription sent to server');
    
  } catch (error) {
    console.error('[SW] Failed to handle push subscription change:', error);
  }
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

// Log service worker messages for debugging
self.addEventListener('message', (event) => {
  console.log('💬 [SW] Message received:', event.data);
  
  const { type, data } = event.data;
  
  switch (type) {
    case 'test-notification':
      // Test notification from client
      self.registration.showNotification('Test Notification', {
        body: 'This is a test from service worker',
        icon: '/icons/icon-192.png',
        requireInteraction: true,
        tag: 'test'
      });
      break;
      
    case 'force-sync':
      // Force background sync
      if ('serviceWorker' in self && 'sync' in window.ServiceWorkerRegistration.prototype) {
        self.registration.sync.register('health-tracker-sync');
      }
      break;
      
    case 'schedule-reminder':
      // Handle reminder scheduling
      console.log('[SW] Reminder scheduling requested:', data);
      break;
      
    case 'cancel-reminder':
      // Handle reminder cancellation
      console.log('[SW] Reminder cancellation requested:', data);
      break;
      
    case 'update-cache':
      // Force cache update
      event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
          return cache.addAll(FILES_TO_CACHE);
        })
      );
      break;
      
    default:
      console.log('[SW] Unknown message type:', type);
  }
});

// ============================================================================
// NOTIFICATION CLOSE HANDLING
// ============================================================================

// Notification close event
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event.notification.tag);
  
  // Analytics or tracking for closed notifications could go here
  const notificationData = event.notification.data || {};
  
  if (notificationData.type === 'reminder') {
    // Future: Track reminder dismissal analytics
    console.log('[SW] Reminder notification dismissed');
  }
});

// ============================================================================
// ERROR HANDLING & DEBUGGING
// ============================================================================

// Enhanced error handling for iOS debugging
self.addEventListener('error', (event) => {
  console.error('🚨 [SW] Service Worker Error:', event.error);
  
  // Try to send error to server for debugging
  fetch('https://192.168.0.147/api/log-error', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      error: event.error.message,
      stack: event.error.stack,
      timestamp: Date.now(),
      userAgent: self.navigator.userAgent
    })
  }).catch(() => {
    // Ignore errors when sending error logs
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Helper function to get VAPID key
async function getVapidPublicKey() {
  try {
    const response = await fetch('https://192.168.0.147/vapid-public-key');
    const data = await response.json();
    return urlBase64ToUint8Array(data.publicKey);
  } catch (error) {
    console.error('[SW] Failed to get VAPID key:', error);
    return null;
  }
}

// Helper function to get user ID
async function getUserId() {
  // Try to get from IndexedDB or generate new one
  return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Helper function for VAPID key conversion
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = self.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ============================================================================
// INITIALIZATION COMPLETE
// ============================================================================

console.log('🍎 [SW] iOS-optimized Health Tracker service worker loaded successfully!');
console.log('📱 [SW] Features: Push notifications, background sync, offline support');
console.log('🔔 [SW] Ready to receive server notifications even when app is closed!');