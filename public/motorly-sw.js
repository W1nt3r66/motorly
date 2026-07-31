self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: "Motorly",
      body: event.data?.text() || "You have a new crew notification.",
    };
  }

  const title = payload.title || "Motorly";
  const options = {
    body: payload.body || "You have a new crew notification.",
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/favicon-32.png",
    tag: payload.tag || "motorly-crew",
    renotify: true,
    silent: false,
    vibrate: [180, 80, 180],
    data: {
      url: payload.url || "/?page=crew&section=walkie&fromPush=1",
      roomId: payload.roomId || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || "/?page=crew&section=walkie&fromPush=1",
    self.location.origin,
  ).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windowClients) => {
        for (const client of windowClients) {
          if (new URL(client.url).origin !== self.location.origin) {
            continue;
          }

          if ("navigate" in client) {
            await client.navigate(targetUrl);
          }

          client.postMessage({
            type: "MOTORLY_CREW_NOTIFICATION_OPENED",
            roomId: event.notification.data?.roomId || null,
          });

          return client.focus();
        }

        return self.clients.openWindow(targetUrl);
      }),
  );
});
