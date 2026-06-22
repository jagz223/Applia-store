/* eslint-disable no-undef */
// GenFeb — Service Worker unificado: PWA offline + Firebase Cloud Messaging (push)
// Generado desde sw.template.js — no editar sw.js a mano.

importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "__VITE_FIREBASE_API_KEY__",
  authDomain: "__VITE_FIREBASE_AUTH_DOMAIN__",
  projectId: "__VITE_FIREBASE_PROJECT_ID__",
  storageBucket: "__VITE_FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__VITE_FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__VITE_FIREBASE_APP_ID__",
});

firebase.messaging();

const CACHE_NAME = "genfeb-v18";
const OFFLINE_URL = "/offline.html";

const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.json",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/genfeb-logo-new.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (!url.protocol.startsWith("http")) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: "offline", message: "No hay conexión a internet" }), {
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2)$/) ||
    url.pathname.startsWith("/static/")
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") return response;
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (request.mode === "navigate") return caches.match(OFFLINE_URL);
          return new Response("Offline", { status: 503 });
        })
      )
  );
});

function parseFcmPushPayload(raw) {
  const msg = raw.message || raw;
  const notification = msg.notification || {};
  const data = msg.data || msg;
  const title = notification.title || (data && data.title) || "Genfeb";
  const body = notification.body || (data && data.body) || "Tienes una nueva notificación";
  const url = (data && data.url) || "/";
  const tagType =
    (data && (data.type || data.withdrawalType || data.conversationId || data.transferId)) || "genfeb";
  const tagId =
    (data && (data.bookingId || data.messageId || data.transferId || data.conversationId)) ||
    String(Date.now());
  const tag = `genfeb-${String(tagType).replace(/[^a-zA-Z0-9-_]/g, "_")}-${String(tagId).replace(/[^a-zA-Z0-9-_]/g, "_")}`;
  const isPanic = String((data && data.type) || "").toLowerCase() === "go_panic";
  const offerType = String((data && data.type) || "").toLowerCase();
  const isRideOffer = offerType === "cargo_ride_offer" || offerType === "pack_ride_offer";
  return { title, body, url, tag, isPanic, isRideOffer };
}

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch (_) {
    return;
  }
  const { title, body, url, tag, isPanic, isRideOffer } = parseFcmPushPayload(payload);
  event.waitUntil(
    self.registration
      .showNotification(title, {
        body,
        icon: "/genfeb-logo-new.png",
        badge: "/genfeb-logo-new.png",
        tag,
        renotify: true,
        data: { url },
        ...(isPanic
          ? {
              requireInteraction: true,
              vibrate: [300, 200, 300, 200, 300, 200, 500],
              silent: false,
            }
          : isRideOffer
            ? {
                requireInteraction: true,
                vibrate: [200, 120, 200, 120, 200, 120, 400],
                silent: false,
              }
            : {}),
      })
      .catch(function () {})
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-bookings") event.waitUntil(syncBookings());
  if (event.tag === "sync-messages") event.waitUntil(syncMessages());
});

async function syncBookings() {
  console.log("[SW] Syncing bookings...");
}

async function syncMessages() {
  console.log("[SW] Syncing messages...");
}
