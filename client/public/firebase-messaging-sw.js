/* eslint-disable no-undef */
// Service Worker para Firebase Cloud Messaging (notificaciones push en segundo plano)

importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAmED_DDJC0oI6yjmUuXYgwHv9_yVgpzQw",
  authDomain: "mango-169db.firebaseapp.com",
  projectId: "mango-169db",
  storageBucket: "mango-169db.firebasestorage.app",
  messagingSenderId: "719744946524",
  appId: "1:719744946524:web:f13faf1a886059dc9af199",
});

firebase.messaging();

// Notificación nativa del navegador: listener push (FCM entrega aquí cuando la app está en segundo plano)
self.addEventListener("push", function (event) {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch (_) {
    return;
  }
  // FCM puede enviar { notification: {}, data: {} } o anidado en "message"
  const msg = payload.message || payload;
  const notification = msg.notification || {};
  const data = msg.data || msg;
  const title = notification.title || (data && data.title) || "Nuevo mensaje";
  const body = notification.body || (data && data.body) || "Tienes una nueva notificación";
  const url = (data && data.url) || "/";
  // Usar tag dinámico para evitar que una notificación reemplace a otra
  // (con un tag fijo se “pisan” las notificaciones cuando llegan varias).
  const tagType =
    (data && (data.type || data.withdrawalType || data.conversationId || data.transferId)) || "genfeb";
  const tagId =
    (data && (data.bookingId || data.messageId || data.transferId || data.conversationId)) || String(Date.now());
  const tag = `genfeb-${String(tagType).replace(/[^a-zA-Z0-9-_]/g, "_")}-${String(tagId).replace(/[^a-zA-Z0-9-_]/g, "_")}`;

  event.waitUntil(
    self.registration
      .showNotification(title, {
        body: body,
        icon: "/logo.png",
        tag: tag,
        renotify: true,
        data: { url: url },
      })
      .catch(function () {})
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});

