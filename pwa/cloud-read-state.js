// Cloud-Lesestand: account-scoped snapshots, freshness, coalescing and invalidation.
// Tests cross the same interface as the view; persistence and transport are adapters.
import { readCloudCache, writeCloudCache, clearCloudCache, cloudCacheRevision } from './cloud-cache.js';
import { cloudCall, cloudIdentity, finishLogin } from './cloud-api.js';
export const contentState = value => ({ ...value, people: [], settings: null });
const accessShape = value => JSON.stringify([value.me?.id, value.me?.is_admin, value.me?.upload_enabled, (value.libraries ?? []).map(l => [l.id,l.manage,l.contribute,l.visibility]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))]);
export function createCloudReadState({ call = cloudCall, identity = cloudIdentity, login = finishLogin,
  read = readCloudCache, write = writeCloudCache, clear = clearCloudCache, generation = cloudCacheRevision,
  now = () => Date.now(), online = () => navigator.onLine } = {}) {
  const FRESH_FOR = 60000, CLEANUP_INTERVAL = 10 * 60000;
  const stateRequests = new Map(), libraryRequests = new Map(), cleanupRequests = new Set();
  function check(owner, revision) {
    if (owner !== identity() || revision !== generation(owner)) throw new Error('Der Cloud-Stand wurde inzwischen geändert. Bitte aktualisieren.');
  }
  async function requestSnapshot(owner) {
    let revision = generation(owner); const key = `${owner}:${revision}`;
    if (!stateRequests.has(key)) stateRequests.set(key, (async () => {
      const value = await call('state');
      if (owner !== identity() || revision !== generation(owner)) throw new Error('Der Cloud-Stand wurde inzwischen geändert. Bitte aktualisieren.');
      const previous = await read(owner, 'state');
      if (revision !== generation(owner)) throw new Error('Der Cloud-Stand wurde inzwischen geändert. Bitte aktualisieren.');
      const accessChanged = !!previous && accessShape(previous.value) !== accessShape(value);
      if (accessChanged) { const clearing = clear(owner); revision = generation(owner); await clearing; }
      if (revision !== generation(owner)) throw new Error('Der Cloud-Stand wurde inzwischen geändert. Bitte aktualisieren.');
      if (owner !== identity()) throw new Error('Das angemeldete Konto wurde inzwischen gewechselt.');
      const record = await write(owner, 'state', contentState(value), revision);
      check(owner, revision);
      if (!record || owner !== identity()) throw new Error('Das angemeldete Konto wurde inzwischen gewechselt.');
      return { ...record, value, accessChanged, generation: revision };
    })().finally(() => stateRequests.delete(key)));
    return stateRequests.get(key);
  }
  async function requestLibrary(owner, library) {
    const revision = generation(owner), key = `${owner}:${revision}:${library}`;
    if (!libraryRequests.has(key)) libraryRequests.set(key, (async () => {
      const value = await call('library', { id: library });
      if (owner !== identity() || revision !== generation(owner)) throw new Error('Der Cloud-Stand wurde inzwischen geändert. Bitte aktualisieren.');
      const record = await write(owner, `library:${library}`, value, revision);
      check(owner, revision);
      if (!record) throw new Error('Der Cloud-Stand wurde inzwischen geändert. Bitte aktualisieren.');
      return record;
    })().finally(() => libraryRequests.delete(key)));
    return libraryRequests.get(key);
  }
  function cleanupLater(owner, me, onCleaned = () => {}) {
    if (!me || !online() || cleanupRequests.has(owner)) return;
    cleanupRequests.add(owner);
    // Cleanup is maintenance, not a prerequisite for showing an existing cloud list.
    setTimeout(async () => {
      try {
        const previous = await read(owner, 'cleanup');
        if (owner !== identity() || previous && now() - previous.updatedAt < CLEANUP_INTERVAL) return;
        await write(owner, 'cleanup', true);
        if (owner !== identity()) return;
        const result = await call(me.is_admin ? 'admin_cleanup' : 'cleanup');
        if (result.cleaned && owner === identity()) await onCleaned();
      } catch { /* Maintenance is retried after the next interval, without blocking browsing. */ }
      finally { cleanupRequests.delete(owner); }
    }, 0);
  }
  const fresh = record => !!record && now() - record.updatedAt < FRESH_FOR;
  return {
    async open() { await login(); return identity(); },
    async cached(owner, library) {
      const revision = generation(owner);
      const state = await read(owner, 'state');
      const detail = library ? await read(owner, `library:${library}`) : null;
      check(owner, revision);
      return { state: state ? { ...state, generation: revision } : null, detail, fresh: fresh(state) && (!library || fresh(detail)), online: online() };
    },
    async refresh(owner, library, { available, force = false, onAccessChanged = () => {} } = {}) {
      let revision = generation(owner);
      check(owner, revision);
      try {
        const snapshot = !force && available?.generation === revision && fresh(available) ? available : await requestSnapshot(owner);
        revision = snapshot.generation;
        check(owner, revision);
        if (snapshot.accessChanged) onAccessChanged();
        const detail = library ? await requestLibrary(owner, library) : null;
        check(owner, revision);
        return { snapshot, detail };
      } catch (error) {
        check(owner, revision);
        if ([401, 403, 404].includes(error.status)) { await clear(owner); error.cacheCleared = true; }
        throw error;
      }
    },
    maintain: cleanupLater
  };
}
export const cloudReadState = createCloudReadState();
