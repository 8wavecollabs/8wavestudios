// Shared data layer (IndexedDB). Storefront and back office read/write the same database,
// so both pages must be served from the same origin (run serve.ps1).
const DB = (() => {
  const NAME = 'beatstore', VERSION = 1;
  let dbp;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('tracks', { keyPath: 'id' });
        db.createObjectStore('audio');                       // id -> Blob
        db.createObjectStore('events', { keyPath: 'id', autoIncrement: true }); // plays, carts, purchases
        db.createObjectStore('subscribers', { keyPath: 'email' });
        db.createObjectStore('orders', { keyPath: 'id' });
        db.createObjectStore('settings');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const out = fn(s);
      t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
      t.onerror = () => reject(t.error);
    });
  }

  const all = (store) => tx(store, 'readonly', (s) => s.getAll());
  const get = (store, key) => tx(store, 'readonly', (s) => s.get(key));
  const put = (store, val, key) => tx(store, 'readwrite', (s) => (key === undefined ? s.put(val) : s.put(val, key)));
  const del = (store, key) => tx(store, 'readwrite', (s) => s.delete(key));

  // License tiers modelled on the BeatStars "Imperator" listing.
  const DEFAULT_LICENSES = [
    { id: 'wav', name: 'Premium WAV', price: 51, files: 'WAV, MP3', deal: 'Buy 2 + 1 Free',
      terms: ['Used for music recording', 'Distribute up to 5,000 copies', '500,000 online audio streams', '1 music video', 'Non-profit live performances'] },
    { id: 'stems', name: 'Premium Stems', price: 101, files: 'STEMS, WAV, MP3', deal: 'Buy 2 + 2 Free',
      terms: ['Used for music recording', 'Distribute up to 10,000 copies', '1,000,000 online audio streams', '1 music video', 'For-profit live performances'] },
    { id: 'unlimited', name: 'Unlimited License', price: 201, files: 'STEMS, WAV, MP3', deal: 'Buy 2 + 3 Free',
      terms: ['Used for music recording', 'Distribute UNLIMITED copies', 'UNLIMITED online audio streams', 'UNLIMITED music videos', 'For-profit live performances'] },
    { id: 'sync', name: 'Full Monetization + Sync', price: 401, files: 'STEMS, WAV, MP3', deal: 'Buy 1 + 1 Free',
      terms: ['Used for music recording', 'Distribute UNLIMITED copies', 'UNLIMITED online audio streams', 'UNLIMITED music videos', 'For-profit live performances', 'Radio broadcasting rights (UNLIMITED stations)', 'Sync for film / TV / ads'] },
    { id: 'exclusive', name: 'Exclusive License', price: 2499, files: 'STEMS, WAV, MP3', deal: '',
      terms: ['Full ownership transfer', 'Beat removed from store', 'UNLIMITED everything', 'Sync + broadcast rights'] },
  ];

  const DEFAULT_SETTINGS = {
    producer: 'Your Producer Name',
    tagline: 'Hard-hitting trap, drill & melodic beats. Instant delivery.',
    licenses: DEFAULT_LICENSES,
    stripeLinks: {},          // licenseId -> Stripe Payment Link URL
    newsletterEndpoint: '',   // optional Mailchimp / ConvertKit / Formspree POST URL
  };

  async function settings() {
    const s = await get('settings', 'main');
    return { ...DEFAULT_SETTINGS, ...(s || {}) };
  }
  const saveSettings = (s) => put('settings', s, 'main');

  // BPM bands used for auto-categorizing uploads.
  const BANDS = [
    { id: 'slow', label: 'Slow / Ballad', min: 0, max: 79, fits: 'sad trap, R&B ballads, half-time' },
    { id: 'boom', label: 'Boom Bap / R&B', min: 80, max: 99, fits: 'boom bap, R&B, afrobeat, dancehall' },
    { id: 'mid', label: 'Mid-tempo / Pop', min: 100, max: 119, fits: 'pop rap, reggaeton, afro-pop' },
    { id: 'club', label: 'Club / House', min: 120, max: 135, fits: 'house, pop trap, Jersey club (half)' },
    { id: 'trap', label: 'Trap', min: 136, max: 155, fits: 'trap, Drake / Future type, drill-adjacent' },
    { id: 'fast', label: 'Drill / Fast', min: 156, max: 999, fits: 'UK/NY drill, rage, Jersey club' },
  ];
  const bandFor = (bpm) => BANDS.find((b) => bpm >= b.min && bpm <= b.max) || BANDS[0];

  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

  async function logEvent(type, trackId, extra = {}) {
    await put('events', { type, trackId, ts: Date.now(), ...extra });
  }

  // Seed demo catalog on first run so the store and analytics have something to show.
  async function seedIfEmpty() {
    const tracks = await all('tracks');
    const s = await get('settings', 'main');
    if (tracks.length || s?.seeded) return;
    await put('settings', { ...(s || {}), seeded: true }, 'main');
    const day = 86400000, now = Date.now();
    const demo = [
      { title: 'Imperator', bpm: 144, key: 'F# minor', tags: ['trap', 'hip hop', 'drake'], mood: 'dark', energy: 0.82 },
      { title: 'Fury', bpm: 96, key: 'C minor', tags: ['trap', 'hip hop', 'boom bap'], mood: 'aggressive', energy: 0.7 },
      { title: 'Move', bpm: 91, key: 'F# major', tags: ['pop', 'guitar', 'juice wrld'], mood: 'emotional', energy: 0.55 },
      { title: 'Madhouse', bpm: 120, key: 'C minor', tags: ['trap', 'hip hop', 'boom bap'], mood: 'dark', energy: 0.75 },
      { title: 'Sink', bpm: 80, key: 'F# minor', tags: ['trap', 'pop', 'sad'], mood: 'sad', energy: 0.4 },
      { title: 'Badaman', bpm: 96, key: 'D# minor', tags: ['afrobeat', 'dancehall'], mood: 'bouncy', energy: 0.68 },
      { title: 'Brava', bpm: 132, key: 'B minor', tags: ['afro house', 'dancehall'], mood: 'bouncy', energy: 0.8 },
      { title: 'Surge', bpm: 126, key: 'A minor', tags: ['pop', 'trap', 'hip hop'], mood: 'hype', energy: 0.85 },
    ];
    for (const [i, d] of demo.entries()) {
      const id = uid();
      await put('tracks', { id, ...d, band: bandFor(d.bpm).id, price: 51, demo: true, published: now - (i * 9 + 3) * day, likes: 0 });
      // Synthetic play history: a few tracks trend up this week.
      const base = [40, 18, 22, 12, 26, 15, 30, 20][i];
      const hot = [3, 1, 1, 1, 1.4, 1, 2.2, 1.6][i];
      for (let k = 0; k < 14; k++) {
        const n = Math.round((base / 14) * (k < 7 ? hot : 1) * (0.6 + Math.random() * 0.8));
        for (let p = 0; p < n; p++) await logEvent('play', id, { ts: now - k * day - Math.random() * day });
      }
      const carts = Math.round(base / 8 * hot);
      for (let c = 0; c < carts; c++) await logEvent('cart', id, { ts: now - Math.random() * 14 * day });
    }
  }

  // Per-track play totals (all time + last 7 days) for the storefront
  async function trackStats() {
    const plays = {}, recent = {}, week = Date.now() - 7 * 86400000;
    for (const e of await all('events')) if (e.type === 'play') {
      plays[e.trackId] = (plays[e.trackId] || 0) + 1;
      if (e.ts > week) recent[e.trackId] = (recent[e.trackId] || 0) + 1;
    }
    return { plays, recent };
  }

  async function subscribe({ email, name, prefs, source }) {
    const existing = await get('subscribers', email);
    await put('subscribers', { email, name: name || existing?.name || '', prefs, source: existing?.source || source, ts: existing?.ts || Date.now() });
  }

  // Stores the full file in this browser; returns null because it's played from IndexedDB, not a URL
  async function saveAudio(id, file) { await put('audio', file, id); return null; }

  return {
    cloud: false, DEFAULT_SETTINGS, open, all, get, put, insert: put, del, settings, saveSettings, BANDS, bandFor, uid, logEvent, seedIfEmpty,
    trackStats, subscribe, saveAudio,
    session: async () => ({ local: true }), signIn: async () => {}, signOut: async () => {},
    // The vinyl crate needs the online database (photos, holds, Stripe), so offline mode can't sell records
    uploadImage: async () => { throw new Error('The crate needs online mode (js/config.js)'); },
    removeImages: async () => {},
    crateCheckout: async () => { throw new Error('Checkout for records only works on the live site.'); },
  };
})();
