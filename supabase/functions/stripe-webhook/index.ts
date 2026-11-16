// Supabase Edge Function: receives Stripe events.
//  - Vinyl checkout paid    → records marked SOLD, order saved with the shipping address
//  - Vinyl checkout expired → held records go back on sale
//  - Beat payment link paid → order saved as paid (beat + license from client_reference_id)
// Deploy with "Verify JWT" OFF (Stripe can't send a Supabase login).
// Secrets: STRIPE_WEBHOOK_SECRET (the whsec_… signing secret from Stripe → Webhooks).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

const db = (path: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
});
const rpc = (fn: string, args: unknown) => db(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

// Stripe signature check: HMAC-SHA256 of "<timestamp>.<raw body>", 5-minute tolerance
async function verify(raw: string, header: string | null) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]).filter(([k]) => k === 't'));
  const sigs = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300 || !sigs.length) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  return sigs.some((s) => s.length === hex.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}

async function saveOrder(id: string, data: Record<string, unknown>) {
  // Stripe can deliver an event twice; the session id as primary key keeps one order
  await db('orders?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({ id, data: { id, ...data } }),
  });
}

Deno.serve(async (req) => {
  const raw = await req.text();
  if (!(await verify(raw, req.headers.get('Stripe-Signature')))) return new Response('bad signature', { status: 400 });
  const event = JSON.parse(raw);
  const s = event.data?.object || {};
  const kind = s.metadata?.kind;

  if (event.type === 'checkout.session.completed' && s.payment_status === 'paid') {
    const email = s.customer_details?.email || s.customer_email || '';
    const shipping = s.collected_information?.shipping_details || s.shipping_details || null;
    if (kind === 'crate') {
      const ids = String(s.metadata.record_ids || '').split(',').filter(Boolean);
      await rpc('set_records_status', { p_ids: ids, p_status: 'sold', p_only_if: null });
      const rows = ids.length ? await (await db(`records?id=in.(${ids.map(encodeURIComponent).join(',')})&select=data`)).json() : [];
      await saveOrder(s.id, {
        kind: 'crate', email, status: 'paid', ts: Date.now(), total: (s.amount_total || 0) / 100,
        shippingCost: (s.shipping_cost?.amount_total || 0) / 100, shipping,
        items: rows.map((r: { data: Record<string, any> }) => ({ recordId: r.data.id, title: `${r.data.artist} – ${r.data.title}`, license: r.data.format || 'Vinyl', price: r.data.price })),
      });
    } else if (s.client_reference_id) {
      // Beat sale through a Payment Link: "BeatFile__license"
      const [beat, lic] = String(s.client_reference_id).split('__');
      await saveOrder(s.id, {
        kind: 'beat', email, status: 'paid', ts: Date.now(), total: (s.amount_total || 0) / 100,
        items: [{ title: beat.replace(/_/g, ' '), license: lic || '', price: (s.amount_total || 0) / 100 }],
      });
    }
  }

  if (event.type === 'checkout.session.expired' && kind === 'crate') {
    const ids = String(s.metadata.record_ids || '').split(',').filter(Boolean);
    await rpc('set_records_status', { p_ids: ids, p_status: 'available', p_only_if: 'pending' });
  }

  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
});
