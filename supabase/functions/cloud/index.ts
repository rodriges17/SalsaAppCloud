import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const url = Deno.env.get('SUPABASE_URL')!;
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default;
const publishable = Deno.env.get('SUPABASE_ANON_KEY') ?? JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default;
const appURL = 'https://rodriges17.github.io/SalsaAppCloud/';
const cors = { 'Access-Control-Allow-Origin': 'https://rodriges17.github.io', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
const root = () => createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const checked = (r: { data: any; error: any }): any => { if (r.error) throw new Error(r.error.message); return r.data; };
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
      const user = checked(await adminClient.auth.getUser(token)).user;
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
    if (['admin_user', 'admin_link', 'admin_cleanup'].includes(action)) {
      const state = await rpc('state', {});
      if (!state.me?.is_admin || !userId) return response({ error: 'Nur für den Plattform-Administrator.' }, 403);
      if (action === 'admin_user') {
        const email = String(payload.email ?? '').trim().toLowerCase();
        if (!email.includes('@') || email.length > 254) throw new Error('Gültige E-Mail-Adresse erforderlich.');
        const people = checked(await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })).users;
        let target = people.find((u: any) => u.email?.toLowerCase() === email);
        if (!target) target = checked(await adminClient.auth.admin.createUser({ email, email_confirm: true })).user;
        await rpc('admin_person', { id: target!.id, enabled: payload.enabled === true, quota: payload.quota });
        return response({ ok: true });
      }
      if (action === 'admin_link') {
        const email = String(payload.email ?? '').trim().toLowerCase();
        if (!state.people.some((p: any) => p.email.toLowerCase() === email)) throw new Error('Person zuerst anlegen.');
        const link = checked(await adminClient.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: appURL + '?cloud=1' } }));
        return response({ link: appURL + '?cloud=1&type=magiclink&token_hash=' + encodeURIComponent(link.properties.hashed_token) });
      }
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
    return response({ error: error instanceof Error ? error.message : 'Cloud-Aufruf fehlgeschlagen.' }, 400);
  }
});
