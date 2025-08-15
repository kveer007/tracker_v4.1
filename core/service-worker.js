/**
 * Health Tracker PWA Service Worker
 * Updated with Server Push Notifications Support
 */

// Cache name (Updated version for bug fixes)
const CACHE_NAME = "daily-tracker-v2.2";

// Files to cache (UPDATED - Removed deprecated notification.js)
const FILES_TO_CACHE = [
  '/',
  'index.html',
  'core/core-styles.css',
  'core/core-scripts.js',
  'core/ui.js',
  'trackers/trackers-scripts.js',
  'trackers/trackers-styles.css',
  'workouts/workouts-scripts.js',
  'workouts/workouts-styles.css',
  'habits/habits-scripts.js',
  'habits/habits-styles.css',
  'reminders/reminders-scripts.js',
  'reminders/reminders-styles.css',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/icon?family=Material+Icons+Round'
];

// Install event - Precache static resources
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install');
  
  // Skip waiting to ensure the new service worker activates immediately
  self.skipWaiting();
  
  // Precache static resources
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell and content');
        return cache.addAll(FILES_TO_CACHE);
      })
      .catch((error) => {
        console.error('[Service Worker] Precaching failed:', error);
      })
  );
});

// Activate event - Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate');
  
  // Clear old caches
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[Service Worker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  
  // Ensure the service worker takes control immediately
  self.clients.claim();
});

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
          return fetch(event.request)
            .then((response) => {
              // Check if valid response
              if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
              }
              
              // Clone the response
              const responseToCache = response.clone();
              
              // Cache the fetched response
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
              
              return response;
            })
            .catch((error) => {
              console.error('[Service Worker] Fetch failed:', error);
              // You could return a custom offline page here
            });
        })
    );
  }
});

// UPDATED: Push event - Handle push notifications from server
self.addEventListener('push', (event) => {
  console.log('🔔 [Service Worker] Push notification received!', event);
  
  let notificationData = {
    title: 'Health Tracker',
    body: 'Time to check your progress!',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'health-tracker',
    requireInteraction: false,
    data: {}
  };

  // Parse notification data from server
  if (event.data) {
    try {
      const pushData = event.data.json();
      notificationData = { ...notificationData, ...pushData };
      console.log('📦 [Service Worker] Push data received:', pushData);
    } catch (e) {
      console.log('📝 [Service Worker] Push data as text:', event.data.text());
      notificationData.body = event.data.text();
    }
  }

  // iOS optimization - make notifications more persistent
  const isIOS = /iPad|iPhone|iPod/.test(self.navigator.userAgent);
  if (isIOS) {
    notificationData.requireInteraction = true;
    // Remove actions for iOS compatibility
    delete notificationData.actions;
  }

  // Add custom styling based on notification type
  if (notificationData.data) {
    switch (notificationData.data.type) {
      case 'goal-alert':
        notificationData.icon = '/icons/icon-192.png';
        notificationData.badge = '/icons/icon-192.png';
        notificationData.tag = 'goal-alert';
        break;
      case 'interval-reminder':
        notificationData.icon = '/icons/icon-192.png';
        notificationData.badge = '/icons/icon-192.png';
        notificationData.tag = 'interval-reminder';
        break;
      case 'test':
        notificationData.icon = '/icons/icon-192.png';
        notificationData.badge = '/icons/icon-192.png';
        notificationData.tag = 'test-notification';
        notificationData.requireInteraction = true;
        break;
      default:
        // Handle legacy reminder notifications
        if (notificationData.data.type === 'reminder') {
          notificationData.tag = 'reminder-notification';
        }
    }
  }

  console.log('🔔 [Service Worker] Showing notification:', notificationData);

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
  );
});

// UPDATED: Notification click event - Enhanced for server notifications
self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ [Service Worker] Notification clicked:', event.notification.tag);
  
  // Close the notification
  event.notification.close();
  
  // Get notification data
  const notificationData = event.notification.data || {};
  
  // Determine what action to take based on notification type
  let targetUrl = '/';
  let shouldOpenReminders = false;
  let messageData = {
    type: 'notification-click',
    action: 'open-app',
    notificationType: notificationData.type || 'unknown',
    reminderType: notificationData.reminderType,
    view: 'main'
  };
  
  if (notificationData.type) {
    switch (notificationData.type) {
      case 'goal-alert':
      case 'interval-reminder':
        targetUrl = '/?open=reminders';
        shouldOpenReminders = true;
        messageData.action = 'open-reminders';
        break;
      case 'test':
        targetUrl = '/?open=reminders&view=server-settings';
        shouldOpenReminders = true;
        messageData.action = 'open-reminders';
        messageData.view = 'server-settings';
        break;
      case 'reminder':
        // Legacy reminder support
        targetUrl = '/?open=reminders';
        shouldOpenReminders = true;
        messageData.action = 'open-reminders';
        if (notificationData.reminderId) {
          targetUrl += `&reminder=${notificationData.reminderId}`;
          messageData.reminderId = notificationData.reminderId;
        }
        break;
      default:
        targetUrl = '/';
    }
  }

  console.log('🎯 [Service Worker] Target URL:', targetUrl, 'Open reminders:', shouldOpenReminders);

  // Handle the click event
  event.waitUntil(
    self.clients.matchAll({ 
      type: 'window',
      includeUncontrolled: true 
    }).then((clientList) => {
      console.log('📱 [Service Worker] Found clients:', clientList.length);
      
      // Try to focus an existing window
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          console.log('🔍 [Service Worker] Focusing existing client');
          
          // Send message to client to handle notification click
          if (shouldOpenReminders) {
            client.postMessage(messageData);
          }
          
          return client.focus();
        }
      }
      
      // If no window is open, open a new one
      console.log('🆕 [Service Worker] Opening new window');
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }).catch((error) => {
      console.error('❌ [Service Worker] Error handling notification click:', error);
    })
  );
});

// Background sync event - For future reminder sync functionality
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync:', event);
  
  if (event.tag === 'reminder-sync') {
    event.waitUntil(
      // Future: Sync reminders with server or update scheduled notifications
      Promise.resolve()
    );
  }
});

// UPDATED: Message event - Handle messages from main app
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);
  
  const { type, data } = event.data;
  
  switch (type) {
    case 'schedule-reminder':
      // Future: Handle reminder scheduling
      console.log('[Service Worker] Reminder scheduling requested:', data);
      break;
      
    case 'cancel-reminder':
      // Future: Handle reminder cancellation
      console.log('[Service Worker] Reminder cancellation requested:', data);
      break;
      
    case 'update-cache':
      // Force cache update
      event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
          return cache.addAll(FILES_TO_CACHE);
        })
      );
      break;
      
    case 'ping':
      // Health check from app
      event.ports[0].postMessage({ type: 'pong', timestamp: Date.now() });
      break;
      
    default:
      console.log('[Service Worker] Unknown message type:', type);
  }
});

// UPDATED: Notification close event - Enhanced for analytics
self.addEventListener('notificationclose', (event) => {
  console.log('❌ [Service Worker] Notification closed:', event.notification.tag);
  
  // Analytics or tracking for closed notifications could go here
  const notificationData = event.notification.data || {};
  
  if (notificationData.type) {
    console.log(`📊 [Service Worker] Notification dismissed: ${notificationData.type}`);
    
    // Track different types of dismissals
    switch (notificationData.type) {
      case 'test':
        console.log('[Service Worker] Test notification dismissed');
        break;
      case 'goal-alert':
        console.log('[Service Worker] Goal alert dismissed');
        break;
      case 'interval-reminder':
        console.log('[Service Worker] Interval reminder dismissed');
        break;
      case 'reminder':
        console.log('[Service Worker] Legacy reminder notification dismissed');
        break;
      default:
        console.log('[Service Worker] Unknown notification type dismissed');
    }
  }
});

// Error handling for unhandled promise rejections
self.addEventListener('unhandledrejection', (event) => {
  console.error('[Service Worker] Unhandled promise rejection:', event.reason);
  event.preventDefault();
});

// Error handling for general errors
self.addEventListener('error', (event) => {
  console.error('[Service Worker] Error:', event.error);
});

console.log('[Service Worker] Script loaded successfully');