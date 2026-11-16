// Online data layer: when js/config.js has Supabase keys, swap DB's storage for Supabase
// (database + login + audio storage). Same method names as the offline version in db.js.
(() => {
  const cfg = window.APP_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) return;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const KEY = { subscribers: 'email' };   // primary key column per table (default id)
  const keyOf = (store) => KEY[store] || 'id';

  const check = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

  async function all(store) {
    // Supabase returns at most 1000 rows per request, so page through
    const rows = [], page = 1000;
    for (let from = 0; ; from += page) {
      const chunk = check(await sb.from(store).select('*').range(from, from + page - 1));
      rows.push(...chunk);
      if (chunk.length < page) break;
    }
    return rows.map((r) => fromRow(store, r));
  }

  function fromRow(store, r) {
    if (store === 'events') return { id: r.id, type: r.type, trackId: r.track_id, ts: r.ts, ...r.data };
    return r.data;
  }
  function toRow(store, val, key) {
    if (store === 'settings') return { id: key || 'main', data: val };
    return { [keyOf(store)]: val[keyOf(store)], data: val };
  }

  async function get(store, key) {
    const r = check(await sb.from(store).select('*').eq(keyOf(store), key).maybeSingle());
    return r ? fromRow(store, r) : undefined;
  }
  async function put(store, val, key) {
    if (store === 'audio') return saveAudio(key, val);
    check(await sb.from(store).upsert(toRow(store, val, key)));
  }
  // Plain insert: what guests are allowed to do (orders sent to Stripe)
  async function insert(store, val) { check(await sb.from(store).insert(toRow(store, val))); }
  async function del(store, key) {
    if (store === 'audio') { await sb.storage.from('previews').remove([`${key}.mp3`]); return; }
    check(await sb.from(store).delete().eq(keyOf(store), key));
  }

  async function settings() {
    const s = await get('settings', 'main');
    return { ...DB.DEFAULT_SETTINGS, ...(s || {}) };
  }
  const saveSettings = (s) => put('settings', s, 'main');

  async function logEvent(type, trackId, extra = {}) {
    const { ts, ...data } = extra;
    // Fire-and-forget for guests: a failed play count must never break playback
    const { error } = await sb.from('events').insert({ type, track_id: trackId, ts: ts || Date.now(), data });
    if (error) console.warn('event not recorded:', error.message);
  }

  async function trackStats() {
    const rows = check(await sb.rpc('track_stats'));
    const plays = {}, recent = {};
    for (const r of rows) { plays[r.track_id] = Number(r.total); recent[r.track_id] = Number(r.recent); }
    return { plays, recent };
  }

  async function subscribe({ email, name, prefs, source }) {
    check(await sb.rpc('subscribe', { p_email: email, p_name: name || '', p_prefs: prefs || [], p_source: source || '' }));
  }

  // Uploads a short preview (not the full beat) and returns its public URL
  async function saveAudio(id, file) {
    const { blob } = await Preview.make(file, cfg.previewSeconds || 75, cfg.previewKbps || 96);
    check(await sb.storage.from('previews').upload(`${id}.mp3`, blob, { contentType: 'audio/mpeg', upsert: true }));
    return sb.storage.from('previews').getPublicUrl(`${id}.mp3`).data.publicUrl;
  }

  async function session() {
    const { data } = await sb.auth.getSession();
    if (!data.session) return null;
    const isAdmin = check(await sb.rpc('is_admin'));
    return { email: data.session.user.email, isAdmin };
  }
  async function signIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }
  const signOut = () => sb.auth.signOut();

  Object.assign(DB, {
    cloud: true, all, get, put, insert, del, settings, saveSettings, logEvent, trackStats, subscribe, saveAudio,
    session, signIn, signOut, seedIfEmpty: async () => {},
  });
})();
