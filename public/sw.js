// Service worker minimal : rend l'appli installable sur le bureau et le téléphone.
// Il ne met rien en cache : tes notes restent toujours à jour.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
