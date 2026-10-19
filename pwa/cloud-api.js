import { CLOUD_URL, CLOUD_KEY } from './cloud-config.js';
const SESSION_KEY = `salsa-cloud-session:${new URL('./', import.meta.url).pathname}:v1`;
let session = null, refreshing = null;
try { session = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null'); } catch { /* no session */ }
// Capture Supabase's callback before the local player replaces the hash route.
const callback = new URLSearchParams(location.hash.slice(1));
if (callback.has('access_token') && callback.has('refresh_token')) {
  session = { access_token: callback.get('access_token'), refresh_token: callback.get('refresh_token'), expires_at: Date.now() + Number(callback.get('expires_in') ?? 3600) * 1000 };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  history.replaceState(null, '', location.pathname + location.search);
}
async function parse(response) {
  const data = await response.json().catch(() => ({}));
  if (response.status === 404) throw new Error('Cloud ist noch nicht eingerichtet. Bitte den Administrator um die Supabase-Einrichtung bitten.');
  if (!response.ok || data.error) throw new Error(data.error?.message ?? data.error ?? data.message ?? 'Cloud ist noch nicht eingerichtet oder derzeit nicht erreichbar.');
  return data;
}
export function signedIn() { return !!session; }
export async function accessToken() {
  if (!session) return null;
  if (session.expires_at < Date.now() + 60000) {
    refreshing ??= (async () => {
      try {
        const data = await parse(await fetch(`${CLOUD_URL}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: CLOUD_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token }), signal: AbortSignal.timeout(30000) }));
        session = { ...data, expires_at: Date.now() + data.expires_in * 1000 }; localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } catch (error) {
        if (navigator.onLine) { session = null; localStorage.removeItem(SESSION_KEY); }
        throw error;
      } finally { refreshing = null; }
    })();
    await refreshing;
  }
  return session?.access_token ?? null;
}
export async function cloudCall(action, payload = {}) {
  if (!navigator.onLine) throw new Error('Cloud-Bibliotheken benötigen eine Internetverbindung. Deine lokalen Figuren bleiben offline verfügbar.');
  const token = await accessToken();
  return parse(await fetch(`${CLOUD_URL}/functions/v1/cloud`, { method: 'POST', headers: { apikey: CLOUD_KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action, payload }), signal: AbortSignal.timeout(45000) }));
}
export async function uploadMedia(path, blob, signal) {
  const token = await accessToken(); if (!token) throw new Error('Bitte anmelden.');
  await parse(await fetch(`${CLOUD_URL}/storage/v1/object/salsa-cloud/${path}`, { method: 'POST', headers: { apikey: CLOUD_KEY, Authorization: `Bearer ${token}`, 'Content-Type': blob.type }, body: blob, signal }));
}
export async function logout() {
  const token = session?.access_token; session = null; localStorage.removeItem(SESSION_KEY);
  if (token) await fetch(`${CLOUD_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: CLOUD_KEY, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) }).catch(() => {});
}

let pendingLogin = (() => {
  const url = new URL(location.href), token = url.searchParams.get('token_hash');
  if (!token) return null;
  const link = url.href; url.searchParams.delete('token_hash'); url.searchParams.delete('type');
  history.replaceState(null, '', url.pathname + url.search + url.hash); return link;
})();
export async function loginWithLink(link) {
  let url; try { url = new URL(link); } catch { throw new Error('Bitte den vollständigen persönlichen Anmeldelink einfügen.'); }
  const token = url.searchParams.get('token_hash');
  if (!token || url.searchParams.get('type') !== 'magiclink') throw new Error('Das ist kein gültiger persönlicher Anmeldelink.');
  const data = await parse(await fetch(`${CLOUD_URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: CLOUD_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ token_hash: token, type: 'magiclink' }), signal: AbortSignal.timeout(30000) }));
  if (!data.access_token || !data.refresh_token) throw new Error('Anmeldung unvollständig. Bitte einen neuen Link anfordern.');
  session = { ...data, expires_at: Date.now() + data.expires_in * 1000 }; localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
export async function finishLogin() { if (pendingLogin) { const link = pendingLogin; pendingLogin = null; await loginWithLink(link); } }
