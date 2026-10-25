import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const url = Deno.env.get('SUPABASE_URL')!;
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default;
const publishable = Deno.env.get('SUPABASE_ANON_KEY') ?? JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default;
const appURL = 'https://rodriges17.github.io/SalsaAppCloud/';
const cors = { 'Access-Control-Allow-Origin': 'https://rodriges17.github.io', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
const root = () => createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const checked = (r: { data: any; error: any }): any => { if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code, status: r.error.status }); return r.data; };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return response({ error: 'POST required' }, 405);
  try {
    const input = await req.json(), action = input.action, payload = input.payload ?? {};
    const adminClient = root();
    if (action === 'bootstrap') {
      const token = Deno.env.get('CLOUD_BOOTSTRAP_TOKEN') ?? '', email = Deno.env.get('CLOUD_ADMIN_EMAIL') ?? '';
      if (token.length < 32 || !email || payload.token !== token) return response({ error: 'Einrichtungscode ungültig.' }, 403);
      const existing = checked(await adminClient.from('cloud_people').select('id').eq('is_admin', true));
      if (existing.length) return response({ error: 'Administrator ist bereits eingerichtet.' }, 403);
      const users = checked(await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })).users;
      let user = users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
      if (!user) user = checked(await adminClient.auth.admin.createUser({ email, email_confirm: true })).user;
      checked(await adminClient.rpc('cloud_bootstrap', { uid: user!.id, mail: email }));
      const link = checked(await adminClient.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: appURL + '?cloud=1' } }));
      return response({ link: appURL + '?cloud=1&type=magiclink&token_hash=' + encodeURIComponent(link.properties.hashed_token) });
    }
    const authorization = req.headers.get('Authorization') ?? '';
    let userId: string | null = null;
    if (authorization) {
      const token = authorization.replace(/^Bearer\s+/i, '');
      const identity = await adminClient.auth.getUser(token);
      if (identity.error) return response({ error: 'Bitte erneut anmelden.', code: 'invalid_session' }, 401);
      const user = identity.data.user;
      if (!user) return response({ error: 'Bitte erneut anmelden.' }, 401);
      userId = user.id;
    }
    const client = createClient(url, publishable, { global: { headers: authorization ? { Authorization: authorization } : {} }, auth: { persistSession: false, autoRefreshToken: false } });
    const rpc = async (name: string, data = payload) => checked(await client.rpc('cloud_api', { action: name, payload: data }));
    if (action === 'media_url') {
      const media = await rpc('media');
      const signed = checked(await adminClient.storage.from('salsa-cloud').createSignedUrl(media.path, 300));
      return response({ url: signed.signedUrl });
    }
    if (['admin_user', 'admin_link', 'admin_access', 'admin_cleanup'].includes(action)) {
      const state = await rpc('state', {});
      if (!state.me?.is_admin || !userId) return response({ error: 'Nur für den Plattform-Administrator.' }, 403);
      if (action === 'admin_access') {
        const target = state.people.find((p: any) => p.id === payload.id);
        if (!target) throw new Error('Person nicht gefunden.');
        const memberships = checked(await adminClient.from('cloud_members').select('library_id,role').eq('user_id', target.id));
        return response({ memberships });
      }
      if (action === 'admin_user') {
        const email = String(payload.email ?? '').trim().toLowerCase();
        if (!email.includes('@') || email.length > 254) throw new Error('Gültige E-Mail-Adresse erforderlich.');
        const quota = Number(payload.quota);
        if (!Number.isSafeInteger(quota) || quota < 0 || quota > 1000000000) throw new Error('Speicherlimit muss zwischen 0 und 1000 MB liegen.');
        const existing = state.people.find((p: any) => p.email.toLowerCase() === email);
        if (payload.create_only && existing) throw new Error('Diese Person ist bereits angelegt. Bitte ihren Eintrag öffnen.');
        let target = existing;
        // Auth-only accounts may remain after a failed profile save. Reuse them.
        if (!target) for (let page = 1; ; page++) {
          const users = checked(await adminClient.auth.admin.listUsers({ page, perPage: 1000 })).users;
          target = users.find((u: any) => u.email?.toLowerCase() === email);
          if (target || users.length < 1000) break;
        }
        if (!target) target = checked(await adminClient.auth.admin.createUser({ email, email_confirm: true })).user;
        await rpc('admin_person', { id: target!.id, enabled: payload.enabled === true, quota });
        return response({ ok: true, id: target!.id });
      }
      if (action === 'admin_link') {
        const email = String(payload.email ?? '').trim().toLowerCase();
        if (!state.people.some((p: any) => p.email.toLowerCase() === email)) throw new Error('Person zuerst anlegen.');
        const link = checked(await adminClient.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: appURL + '?cloud=1' } }));
        // No guessed default: only show an expiry when the deployed Auth TTL is verified.
        const ttl = Number(Deno.env.get('CLOUD_MAGIC_LINK_TTL_SECONDS'));
        const issuedAt = new Date(link.user.confirmation_sent_at ?? '').getTime();
        const expires_at = Number.isSafeInteger(ttl) && ttl > 0 && ttl <= 86400 && Number.isFinite(issuedAt) ? new Date(issuedAt + ttl * 1000).toISOString() : null;
        return response({ link: appURL + '?cloud=1&type=magiclink&token_hash=' + encodeURIComponent(link.properties.hashed_token), expires_at });
      }
    }
    if (action === 'member_check' || action === 'member') {
      const detail = await rpc('library', { id: payload.library });
      if (!detail.manage || !userId) return response({ error: 'Keine Berechtigung zur Mitgliederverwaltung.', access_changed: true }, 403);
      const email = String(payload.email ?? '').trim().toLowerCase();
      const person = checked(await adminClient.from('cloud_people').select('upload_enabled').eq('email', email).maybeSingle());
      if (!person) throw new Error('Person muss zuerst vom Administrator angelegt werden.');
      if (action === 'member_check') return response({ upload_enabled: person.upload_enabled });
      if (payload.role === 'contributor' && (!detail.library.collaborative || !person.upload_enabled)) throw new Error(!detail.library.collaborative ? 'Diese Bibliothek erlaubt keine gemeinschaftlichen Beiträge.' : 'Person hat keine Upload-Freigabe.');
      return response(await rpc('member'));
    }
    if (action === 'delete_figure') {
      const state = await rpc('state', {});
      const figure = checked(await adminClient.from('cloud_figures').select('id,owner_id').eq('id', payload.figure).single());
      if (!userId || (figure.owner_id !== userId && !state.me?.is_admin)) return response({ error: 'Keine Berechtigung.' }, 403);
      const media = checked(await adminClient.from('cloud_media').select('path').eq('figure_id', figure.id));
      if (media.length) checked(await adminClient.storage.from('salsa-cloud').remove(media.map((m: any) => m.path)));
      checked(await adminClient.rpc('cloud_delete_figure', { fid: figure.id, uid: userId }));
      return response({ ok: true });
    }
    if (['finalize', 'abort', 'cleanup', 'admin_cleanup'].includes(action)) {
      if (!userId) return response({ error: 'Anmeldung erforderlich.' }, 401);
      if (action === 'finalize') {
        const media = checked(await adminClient.from('cloud_media').select('id,owner_id,job_id').eq('id', payload.id).single());
        if (media.owner_id !== userId || !media.job_id) return response({ error: 'Keine Berechtigung.' }, 403);
        checked(await adminClient.rpc('cloud_finish_media', { media_id: media.id, owner: userId }));
        return response({ ok: true });
      }
      let query = adminClient.from('cloud_jobs').select('id,owner_id');
      if (action === 'abort') query = query.eq('id', payload.job).eq('owner_id', userId);
      else { query = query.lt('expires_at', new Date().toISOString()); if (action !== 'admin_cleanup') query = query.eq('owner_id', userId); }
      const jobs = checked(await query);
      for (const job of jobs) {
        const media = checked(await adminClient.from('cloud_media').select('path').eq('job_id', job.id));
        if (media.length) checked(await adminClient.storage.from('salsa-cloud').remove(media.map((m: any) => m.path)));
        checked(await adminClient.rpc('cloud_release_job', { jid: job.id }));
      }
      return response({ ok: true, cleaned: jobs.length });
    }
    return response(await rpc(action));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cloud-Aufruf fehlgeschlagen.';
    const denied = /Keine Berechtigung|Kein Zugriff|Keine Beitragsberechtigung|Keine Freigabeberechtigung|Keine Freischaltung|Uploads sind nicht freigeschaltet|Nur (der|für den) Plattform|freigeschalteten Konto/i.test(message);
    return response({ error: message, access_changed: denied }, denied ? 403 : 400);
  }
});
