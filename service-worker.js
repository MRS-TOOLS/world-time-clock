"use strict";

// Keep these URLs in sync with the versioned references in index.html.
// Bump CACHE_NAME whenever these files or the app shell are released.
const CACHE_PREFIX = "mrs-world-time-clock-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const APP_FILES = [
  "./",
  "./index.html",
  "./style.css?v=20260930-14",
  "./timezones.js?v=20260930-10",
  "./script.js?v=20260930-11"
].map((path) => new URL(path, self.registration.scope).href);
const OFFLINE_PAGE = new URL("./index.html", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === "navigate";
  if (!isNavigation && !APP_FILES.includes(url.href)) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        // A storage quota error must not prevent a successful online response.
        try {
          await cache.put(request, response.clone());
        } catch (error) {
          console.warn("オフライン用キャッシュを更新できませんでした。", error);
        }
      }
      return response;
    } catch (error) {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      if (isNavigation) {
        const offlinePage = await cache.match(OFFLINE_PAGE);
        if (offlinePage) return offlinePage;
      }
      return Response.error();
    }
  })());
});
