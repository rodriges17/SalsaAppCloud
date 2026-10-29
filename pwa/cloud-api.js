import { clearCloudCache } from './cloud-cache.js';
import { CLOUD_URL, CLOUD_KEY } from './cloud-config.js';
const SESSION_KEY = `salsa-cloud-session:${new URL('./', import.meta.url).pathname}:v1`;
let session = null, refreshing = null, loginEpoch = 0, linkAttempt = null;
let confirmLinkLogin = async () => false;
export function setLinkLoginConfirmation(confirm) { confirmLinkLogin = confirm; }
export function cancelLinkLogin() {
  loginEpoch++;
  linkAttempt?.abort(); linkAttempt = null;
}
async function discardLinkSession(candidate) {
  const current = storedSession();
  if (!candidate?.access_token || current?.access_token === candidate.access_token || current?.refresh_token === candidate.refresh_token) return;
  await fetch(`${CLOUD_URL}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: CLOUD_KEY, Authorization: `Bearer ${candidate.access_token}` }, signal: AbortSignal.timeout(10000) }).catch(() => {});
}
function storedSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null'); } catch { return session; } }
session = storedSession();
export function cloudIdentity() {
  session = storedSession();
  if (!session) return 'public';
  if (!session.cache_id) { session = { ...session, cache_id: crypto.randomUUID() }; localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
  return `session:${session.cache_id}`;
}
async function replaceSession(next, expired = false) {
  cancelLinkLogin();
  const previous = cloudIdentity();
  session = next ? { ...next, cache_id: crypto.randomUUID() } : null;
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session)); else localStorage.removeItem(SESSION_KEY);
  // Notify synchronously so a previous account cannot remain visible while deletion runs.
  globalThis.dispatchEvent?.(new CustomEvent('cloud-session-changed', { detail: { expired } }));
  await clearCloudCache(previous);
  // Retire the pre-snapshot poster cache, whose keys were not session-scoped.
  try { indexedDB.deleteDatabase(`step-cloud-posters:${new URL('./', import.meta.url).pathname}:v1`); } catch {}
}
globalThis.addEventListener?.('storage', event => {
  if (event.key !== SESSION_KEY) return;
  let old, next; try { old = JSON.parse(event.oldValue ?? 'null'); next = JSON.parse(event.newValue ?? 'null'); } catch {}
  if (old?.cache_id && old.cache_id === next?.cache_id) return; // Token rotation is the same account/session.
  cancelLinkLogin();
  if (old?.cache_id) void clearCloudCache(`session:${old.cache_id}`);
  globalThis.dispatchEvent?.(new CustomEvent('cloud-session-changed', { detail: { external: true } }));
});
// Legacy token fragments are untrusted input, never an authentication callback.
const callback = new URLSearchParams(location.hash.slice(1));
if (callback.has('access_token') || callback.has('refresh_token')) {
  history.replaceState(null, '', location.pathname + location.search);
}
async function parse(response) {
  const data = await response.json().catch(() => ({}));
  if (response.status === 404) { const error = new Error('Cloud ist noch nicht eingerichtet. Bitte den Administrator um die Supabase-Einrichtung bitten.'); error.status = 404; throw error; }
  if (!response.ok || data.error) {
    const error = new Error(data.error?.message ?? data.error_description ?? data.msg ?? data.message ?? (typeof data.error === 'string' ? data.error : 'Cloud ist noch nicht eingerichtet oder derzeit nicht erreichbar.'));
    error.accessChanged = data.access_changed === true || response.status === 403; error.status = response.status; error.code = data.code ?? data.error_code ?? data.error; throw error;
  }
  return data;
}
export function signedIn() { session = storedSession(); return !!session; }
async function refreshSession() {
  // Re-read after acquiring the cross-tab lock: another tab may have rotated tokens.
  session = storedSession();
  if (!session) return null;
  if (Number.isFinite(session.expires_at) && session.expires_at >= Date.now() + 60000) return session.access_token;
  const previous = session;
  try {
    const data = await parse(await fetch(`${CLOUD_URL}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: CLOUD_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: previous.refresh_token }), signal: AbortSignal.timeout(30000) }));
    if (!data.access_token || !data.refresh_token || !(data.expires_in > 0)) throw new Error('Anmeldung konnte nicht vollständig erneuert werden. Bitte erneut versuchen.');
    const current = storedSession();
    if (current?.refresh_token !== previous.refresh_token) { session = current; return current?.access_token ?? null; }
    const renewed = { ...data, cache_id: previous.cache_id, expires_at: Date.now() + data.expires_in * 1000 };
    localStorage.setItem(SESSION_KEY, JSON.stringify(renewed)); session = renewed;
    return session.access_token;
  } catch (error) {
    const invalid = ['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'session_expired', 'user_not_found', 'user_banned', 'invalid_grant'].includes(error.code);
    if (invalid && [400, 401, 403].includes(error.status) && storedSession()?.refresh_token === previous.refresh_token) {
      await replaceSession(null, true);
      throw new Error('Deine Anmeldung ist abgelaufen oder wurde widerrufen. Bitte erneut anmelden: als Plattform-Admin mit E-Mail und Passwort oder mit einem neuen persönlichen Link.');
    }
    // Timeouts, network failures and server errors must never erase the session.
    throw error;
  }
}
export async function accessToken() {
  session = storedSession();
  if (!session) return null;
  if (Number.isFinite(session.expires_at) && session.expires_at >= Date.now() + 60000) return session.access_token;
  if (!refreshing) {
    const work = () => refreshSession();
    refreshing = (navigator.locks ? navigator.locks.request(`${SESSION_KEY}:refresh`, work) : work()).finally(() => { refreshing = null; });
  }
  return refreshing;
}
const READS = new Set(['tags', 'state', 'library', 'poster_get', 'poster_put', 'media_url', 'media', 'admin_link', 'admin_access', 'member_check', 'duplicates']);
export async function cloudCall(action, payload = {}) {
  if (!navigator.onLine) throw new Error('Cloud-Bibliotheken benötigen eine Internetverbindung. Deine lokalen Figuren bleiben offline verfügbar.');
  const owner = cloudIdentity(), token = await accessToken();
  if (owner !== cloudIdentity()) throw new Error('Das angemeldete Konto wurde inzwischen gewechselt. Bitte erneut öffnen.');
  const result = await parse(await fetch(`${CLOUD_URL}/functions/v1/cloud`, { method: 'POST', headers: { apikey: CLOUD_KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action, payload }), signal: AbortSignal.timeout(45000) }));
  if (owner !== cloudIdentity()) throw new Error('Das angemeldete Konto wurde inzwischen gewechselt. Bitte erneut öffnen.');
  if (!READS.has(action) && (!['cleanup', 'admin_cleanup'].includes(action) || result.cleaned)) await clearCloudCache(owner, true);
  return result;
}
export async function uploadMedia(path, blob, signal) {
  const token = await accessToken(); if (!token) throw new Error('Bitte anmelden.');
  await parse(await fetch(`${CLOUD_URL}/storage/v1/object/salsa-cloud/${path}`, { method: 'POST', headers: { apikey: CLOUD_KEY, Authorization: `Bearer ${token}`, 'Content-Type': blob.type }, body: blob, signal }));
}
export async function logout() {
  const token = storedSession()?.access_token; await replaceSession(null);
  if (token) await fetch(`${CLOUD_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: CLOUD_KEY, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) }).catch(() => {});
}

let pendingLogin = (() => {
  const url = new URL(location.href), token = url.searchParams.get('token_hash');
  if (!token) return null;
  const link = url.href; url.searchParams.delete('token_hash'); url.searchParams.delete('type');
  history.replaceState(null, '', url.pathname + url.search + url.hash); return link;
})();
export async function loginWithLink(link, confirm = confirmLinkLogin) {
  cancelLinkLogin();
  const epoch = loginEpoch, owner = cloudIdentity(), attempt = new AbortController();
  linkAttempt = attempt;
  const active = () => !attempt.signal.aborted && epoch === loginEpoch && owner === cloudIdentity();
  const check = () => { if (!active()) throw new Error('Diese Anmeldung wurde inzwischen abgebrochen.'); };
  let data, adopted = false;
  try {
    let url; try { url = new URL(link); } catch { throw new Error('Bitte den vollständigen persönlichen Anmeldelink einfügen.'); }
    const token = url.searchParams.get('token_hash');
    if (!token || url.searchParams.get('type') !== 'magiclink') throw new Error('Das ist kein gültiger persönlicher Anmeldelink.');
    data = await parse(await fetch(`${CLOUD_URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: CLOUD_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ token_hash: token, type: 'magiclink' }), signal: AbortSignal.timeout(30000) }));
    check();
    if (!data.access_token || !data.refresh_token || !(data.expires_in > 0) || !data.user?.id || !data.user?.email) throw new Error('Anmeldung unvollständig. Bitte einen neuen Link anfordern.');
    let previousUser = null;
    if (storedSession()) {
      // Read the current identity from Auth, never from the link or an unverified JWT.
      const previousToken = await accessToken(); check();
      previousUser = await parse(await fetch(`${CLOUD_URL}/auth/v1/user`, { headers: { apikey: CLOUD_KEY, Authorization: `Bearer ${previousToken}` }, signal: AbortSignal.timeout(30000) }));
      check();
      if (!previousUser.id || !previousUser.email) throw new Error('Das bisherige Konto konnte nicht geprüft werden. Bitte erneut versuchen.');
    }
    const accepted = await confirm({ email: data.user.email, previousEmail: previousUser?.email ?? null, sameAccount: previousUser?.id === data.user.id, signal: attempt.signal });
    check();
    if (accepted !== true) throw new Error('Anmeldung abgebrochen. Der geprüfte Einmallink ist verbraucht. Bitte einen neuen persönlichen Anmeldelink anfordern.');
    // No asynchronous gap between the last identity check and session adoption.
    adopted = true;
    await replaceSession({ ...data, expires_at: Date.now() + data.expires_in * 1000 });
  } finally {
    if (linkAttempt === attempt) linkAttempt = null;
    if (data && !adopted) await discardLinkSession(data);
  }
}
// Authenticate with Supabase first, then verify the database-backed platform role
// before publishing the candidate session or exposing cached admin content.
export async function loginWithPassword(email, password) {
  cancelLinkLogin();
  const epoch = loginEpoch, owner = cloudIdentity();
  email = String(email ?? '').trim().toLowerCase();
  if (!email.includes('@') || !password) throw new Error('Bitte E-Mail-Adresse und Passwort eingeben.');
  let data, adopted = false;
  try {
    try {
      data = await parse(await fetch(`${CLOUD_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: CLOUD_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(30000) }));
    } catch (error) {
      if (['invalid_credentials', 'email_not_confirmed', 'user_banned'].includes(error.code)) throw new Error('Anmeldung nicht möglich. Bitte E-Mail-Adresse und Passwort prüfen.');
      if (error.status === 429) throw new Error('Zu viele Anmeldeversuche. Bitte später erneut versuchen.');
      throw error;
    }
    if (!data.access_token || !data.refresh_token || !(data.expires_in > 0)) throw new Error('Anmeldung unvollständig. Bitte erneut versuchen.');
    if (epoch !== loginEpoch || owner !== cloudIdentity()) throw new Error('Diese Anmeldung wurde inzwischen abgebrochen.');
    const state = await parse(await fetch(`${CLOUD_URL}/functions/v1/cloud`, { method: 'POST', headers: { apikey: CLOUD_KEY, Authorization: `Bearer ${data.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'state', payload: {} }), signal: AbortSignal.timeout(45000) }));
    if (epoch !== loginEpoch || owner !== cloudIdentity()) throw new Error('Diese Anmeldung wurde inzwischen abgebrochen.');
    if (!state.me?.is_admin) throw new Error('Diese Anmeldung ist nur für Plattform-Admins. Bitte deinen persönlichen Anmeldelink verwenden.');
    adopted = true;
    await replaceSession({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 });
  } finally {
    // Discard only this candidate; never revoke another tab's accepted login.
    if (data?.access_token && !adopted) await fetch(`${CLOUD_URL}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: CLOUD_KEY, Authorization: `Bearer ${data.access_token}` }, signal: AbortSignal.timeout(10000) }).catch(() => {});
  }
}
export async function setAdminPassword(password, currentPassword = '') {
  if (typeof password !== 'string' || password.length < 12) throw new Error('Bitte ein Passwort mit mindestens 12 Zeichen wählen.');
  const owner = cloudIdentity(), state = await cloudCall('state');
  if (!state.me?.is_admin) throw new Error('Nur Plattform-Admins können hier ihr Passwort einrichten.');
  const token = await accessToken();
  if (!token || owner !== cloudIdentity()) throw new Error('Das angemeldete Konto wurde inzwischen gewechselt. Bitte erneut anmelden.');
  try {
    await parse(await fetch(`${CLOUD_URL}/auth/v1/user`, { method: 'PUT', headers: { apikey: CLOUD_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password, ...(currentPassword ? { current_password: currentPassword } : {}) }), signal: AbortSignal.timeout(30000) }));
  } catch (error) {
    if (error.code === 'reauthentication_needed') throw new Error('Bitte erneut anmelden und danach das Passwort setzen. Für die erste Einrichtung kannst du einen neuen persönlichen Anmeldelink verwenden.');
    if (['current_password_required', 'missing_current_password', 'invalid_current_password'].includes(error.code)) throw new Error('Bitte dein bisheriges Passwort eingeben und erneut versuchen.');
    if (error.code === 'same_password') throw new Error('Das neue Passwort entspricht bereits deinem bisherigen Passwort.');
    throw error;
  }
  if (owner !== cloudIdentity()) throw new Error('Das Konto wurde gewechselt. Das Passwort wurde für das zuvor angemeldete Konto gespeichert.');
}
let finishingLogin = null;
export async function finishLogin() {
  if (!finishingLogin && pendingLogin) {
    const link = pendingLogin; pendingLogin = null;
    finishingLogin = loginWithLink(link).finally(() => { finishingLogin = null; });
  }
  await finishingLogin;
}
