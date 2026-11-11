/* Suivi affaires — service de fond du téléphone
 * Reçoit les notifications Firebase même quand l'appli est fermée,
 * et ouvre le bon dossier quand on touche la notification.
 * La configuration Firebase est transmise dans l'adresse de ce fichier (?cfg=…).
 */
/* global importScripts, firebase, clients */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

let cfg = null;
try { cfg = JSON.parse(new URL(self.location).searchParams.get('cfg') || 'null'); } catch (e) { cfg = null; }

// Ouvre (ou ramène au premier plan) l'appli sur le lien de la notification
self.addEventListener('notificationclick', (event) => {
  const data = (event.notification && event.notification.data) || {};
  const lien = (data.FCM_MSG && data.FCM_MSG.data && data.FCM_MSG.data.lien) || data.lien || '/';
  event.notification.close();
  event.stopImmediatePropagation(); // c'est nous qui ouvrons le dossier, pas Firebase (évite une double ouverture)
  event.waitUntil((async () => {
    const fenetres = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const f of fenetres) {
      if (new URL(f.url).origin === self.location.origin) {
        await f.focus();
        if ('navigate' in f) { try { await f.navigate(lien); } catch (e) { /* ignore */ } }
        return;
      }
    }
    await clients.openWindow(lien);
  })());
});

if (cfg && cfg.apiKey && cfg.apiKey !== 'A_REMPLIR') {
  importScripts(
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js'
  );
  firebase.initializeApp(cfg);
  // Les notifications envoyées par le programme Google contiennent déjà le titre et le texte :
  // Firebase les affiche tout seul quand l'appli est fermée.
  firebase.messaging();
}
