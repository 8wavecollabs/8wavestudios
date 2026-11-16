// Supabase Edge Function: starts a Stripe Checkout for records in the crate cart.
// Prices and availability come from the database, never from the browser.
// Secrets (Supabase → Edge Functions → Secrets): STRIPE_SECRET_KEY, optional SITE_URL (default https://8wavestudios.com).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const SITE_URL = (Deno.env.get('SITE_URL') || 'https://8wavestudios.com').replace(/\/$/, '');
const ALLOWED_ORIGINS = [SITE_URL, SITE_URL.replace('://', '://www.'), 'http://localhost:8080'];

// International destinations offered at checkout (Stripe needs an explicit list)
const INTL_COUNTRIES = ['CA', 'MX', 'GB', 'IE', 'FR', 'DE', 'NL', 'BE', 'LU', 'ES', 'PT', 'IT', 'AT', 'CH', 'DK', 'SE', 'NO',
  'FI', 'IS', 'PL', 'CZ', 'GR', 'HU', 'RO', 'HR', 'SI', 'SK', 'EE', 'LV', 'LT', 'AU', 'NZ', 'JP', 'KR', 'SG', 'HK', 'TW',
  'BR', 'AR', 'CL', 'CO', 'ZA', 'IL', 'AE', 'PH', 'MY', 'TH', 'IN'];

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.includes(origin) ? origin : SITE_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

const db = (path: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
});
const rpc = (fn: string, args: unknown) => db(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const headers = { ...cors(origin), 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });

  let ids: string[], region: string, email: string;
  try {
    ({ ids, region, email } = await req.json());
  } catch { return reply(400, { error: 'Bad request' }); }
  ids = [...new Set(Array.isArray(ids) ? ids.filter((x) => typeof x === 'string' && /^[a-z0-9]{6,40}$/i.test(x)) : [])];
  if (!ids.length || ids.length > 20) return reply(400, { error: 'Pick between 1 and 20 records.' });
  if (region !== 'us' && region !== 'intl') return reply(400, { error: 'Choose US or international shipping.' });

  // Hold the records a little longer than the Stripe session lasts so nobody else can buy them meanwhile
  const until = Date.now() + 33 * 60 * 1000;
  const held = await (await rpc('reserve_records', { p_ids: ids, p_until: until })).json();
  const heldIds: string[] = Array.isArray(held) ? held.map((r: { id: string }) => r.id) : [];
  if (heldIds.length !== ids.length) {
    if (heldIds.length) await rpc('set_records_status', { p_ids: heldIds, p_status: 'available', p_only_if: 'pending' });
    return reply(409, { error: 'Sorry — one or more of these records just sold or is in someone else\'s checkout.', unavailable: ids.filter((i) => !heldIds.includes(i)) });
  }
  const records = held.map((r: { data: Record<string, unknown> }) => r.data);

  const settings = (await (await db('settings?id=eq.main&select=data')).json())[0]?.data || {};
  const ship = { usFirst: 6, usEach: 1, intlFirst: 30, intlEach: 5, ...(settings.crateShipping || {}) };
  const first = region === 'us' ? ship.usFirst : ship.intlFirst, each = region === 'us' ? ship.usEach : ship.intlEach;
  const shipping = Math.round((Number(first) + Number(each) * (records.length - 1)) * 100);

  const p = new URLSearchParams();
  p.set('mode', 'payment');
  p.set('expires_at', String(Math.floor(Date.now() / 1000) + 31 * 60)); // Stripe's minimum is 30 minutes
  p.set('metadata[kind]', 'crate');
  p.set('metadata[record_ids]', ids.join(','));
  p.set('success_url', `${origin && ALLOWED_ORIGINS.includes(origin) ? origin : SITE_URL}/crate.html?paid=1`);
  p.set('cancel_url', `${origin && ALLOWED_ORIGINS.includes(origin) ? origin : SITE_URL}/crate.html?canceled=1`);
  if (typeof email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) p.set('customer_email', email);
  records.forEach((r: Record<string, any>, i: number) => {
    p.set(`line_items[${i}][quantity]`, '1');
    p.set(`line_items[${i}][price_data][currency]`, 'usd');
    p.set(`line_items[${i}][price_data][unit_amount]`, String(Math.round(Number(r.price) * 100)));
    p.set(`line_items[${i}][price_data][product_data][name]`, `${r.artist} – ${r.title}`.slice(0, 250));
    p.set(`line_items[${i}][price_data][product_data][description]`,
      [r.format, r.media && `Media ${r.media}`, r.sleeve && `Sleeve ${r.sleeve}`].filter(Boolean).join(' · ') || 'Vinyl record');
    if (r.photos?.[0]) p.set(`line_items[${i}][price_data][product_data][images][0]`, r.photos[0]);
  });
  (region === 'us' ? ['US'] : INTL_COUNTRIES).forEach((c, i) => p.set(`shipping_address_collection[allowed_countries][${i}]`, c));
  p.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
  p.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(shipping));
  p.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'usd');
  p.set('shipping_options[0][shipping_rate_data][display_name]', region === 'us' ? 'USPS Media Mail (US)' : 'International shipping');

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: p,
  });
  const session = await res.json();
  if (!res.ok) {
    await rpc('set_records_status', { p_ids: ids, p_status: 'available', p_only_if: 'pending' });
    console.error('stripe error', session?.error?.message);
    return reply(502, { error: 'Checkout could not start. Please try again.' });
  }
  return reply(200, { url: session.url });
});
