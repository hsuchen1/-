// service-worker.js
const CACHE_NAME = 'mis-challenge-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  // Assuming index.tsx is served as /index.tsx or its bundled output (e.g., /index.js) is the main script.
  // This entry point loads App.tsx, constants.ts, etc.
  '/index.tsx', 
  'https://cdn.tailwindcss.com',
  'https://esm.sh/react@19.1.0',
  'https://esm.sh/react-dom@19.1.0/client',
  '/manifest.json',
  '/icons/icon-192x192.png', // These icon paths should exist
  '/icons/icon-512x512.png'  // at the root in an 'icons' folder.
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache:', CACHE_NAME);
        const cachePromises = urlsToCache.map(urlToCache => {
          const request = new Request(urlToCache, { mode: 'cors' }); // Default to CORS for all, especially CDNs
          return fetch(request)
            .then(response => {
              if (!response.ok) {
                // For cross-origin, if CORS request failed, try no-cors.
                // This leads to opaque responses, which have limitations but allow caching.
                if (new URL(urlToCache, self.location.origin).origin !== self.location.origin) {
                  console.warn(`CORS request for ${urlToCache} failed (${response.status}), trying no-cors.`);
                  return fetch(new Request(urlToCache, { mode: 'no-cors' }));
                }
                // For same-origin resources, if response is not ok, it's a critical error.
                throw new Error(`Failed to fetch (same-origin) ${urlToCache}: ${response.status} ${response.statusText}`);
              }
              return response; // Original successful response (CORS or same-origin)
            })
            .then(response => {
              // Check response again after potential no-cors fallback
              if (!response.ok && response.type !== 'opaque') {
                 // If it's not ok and not opaque (meaning same-origin failure or CORS failure not falling back correctly)
                 throw new Error(`Failed to cache ${urlToCache} (not ok and not opaque): ${response.status} ${response.statusText}`);
              }
              console.log(`Caching: ${urlToCache}, Type: ${response.type}`);
              return cache.put(urlToCache, response);
            })
            .catch(err => {
              console.warn(`Skipping ${urlToCache} from cache due to error:`, err.message);
              // Don't let one failed asset (especially a non-critical one like an icon) stop the whole install.
              // However, core assets failing is a problem.
              if (urlToCache === '/' || urlToCache === '/index.html' || urlToCache === '/index.tsx') {
                throw err; // Re-throw for critical assets
              }
              return Promise.resolve(); // Continue with other assets
            });
        });
        return Promise.all(cachePromises);
      })
      .then(() => {
        console.log('All specified assets attempted to cache. Check warnings for any skips.');
      })
      .catch(err => {
        console.error('Critical caching failed during install:', err);
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim(); // Ensure new service worker takes control immediately
});

self.addEventListener('fetch', event => {
  // Let the browser handle requests for extensions (if any)
  if (event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          // Cache hit - return response
          return response;
        }

        // Not in cache - try to fetch from network
        return fetch(event.request).then(
          networkResponse => {
            // Check if we received a valid response to cache
            // Only cache GET requests.
            // Only cache responses that are 'basic' (same-origin) or 'cors' (CORS-enabled cross-origin).
            // Avoid caching 'opaque' responses fetched on-the-fly unless specifically intended.
            if (
              event.request.method === 'GET' &&
              networkResponse &&
              networkResponse.status === 200 &&
              (networkResponse.type === 'basic' || networkResponse.type === 'cors')
            ) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
          }
        ).catch(error => {
          console.warn('Fetch failed; trying to serve from cache or offline fallback for:', event.request.url, error);
          // If it's a navigation request, you might want to return a generic offline.html page
          // For this app, if essential assets are not cached, it might not work fully offline.
          // The pre-caching during 'install' is key.
        });
      })
  );
});
