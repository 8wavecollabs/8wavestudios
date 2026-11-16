# The Crate — setup (vinyl records)

Do these once. Nothing here needs you to share a password or key with anyone — you paste keys straight into Supabase.

## 1. Database (2 min)
Supabase → **SQL Editor → New query** → paste all of `supabase/crate.sql` → **Run** → "Success".

## 2. Stripe key for the server (3 min)
Use a **restricted key** so the server can only create checkouts:
1. Stripe → **Developers → API keys → Create restricted key**.
   Start in **Sandbox / test mode** for a trial run.
2. Name it `8wave crate`. Set **Checkout Sessions → Write**. Leave everything else **None**. Create, then copy the `rk_test_…` key.
   (If a test checkout fails with a permissions error, also set **Products → Write** and **Prices → Write** on that key.)
3. Supabase → **Edge Functions → Secrets** → add:
   - `STRIPE_SECRET_KEY` = the `rk_test_…` key
   - `SITE_URL` = `https://8wavestudios.com`

## 3. Server functions (5 min)
Supabase → **Edge Functions → Deploy a new function → Via editor**:
1. Name **`crate-checkout`** → replace the sample code with all of `supabase/functions/crate-checkout/index.ts` → **Deploy**.
2. Name **`stripe-webhook`** → paste `supabase/functions/stripe-webhook/index.ts` → **Deploy**.
   Then open `stripe-webhook` → **Details / Settings** → turn **off "Verify JWT"** (Stripe can't log in) → Save.

## 4. Stripe webhook (3 min)
Stripe → **Developers → Webhooks → Add destination** (same mode as your key):
- Events: `checkout.session.completed` and `checkout.session.expired`
- Endpoint URL: `https://mchpykpjjingtbmwqxjl.supabase.co/functions/v1/stripe-webhook`
- Create, then reveal the **Signing secret** (`whsec_…`) → Supabase **Edge Functions → Secrets** → `STRIPE_WEBHOOK_SECRET`.

Bonus: this webhook also marks **beat** sales as **✅ Paid** in your Orders tab automatically.

## 5. Shipping prices
Back office → **Settings → Vinyl shipping** → set US / international rates → **Save settings**.
Defaults: US $6 first + $1 each extra · International $30 first + $5 each extra.

## 6. Publish the page
Run `tools\build-dist.ps1` → Netlify → your project → **Deploys** → drag in the `dist` folder.
The Crate is at **8wavestudios.com/crate.html** (also linked in the store menu).

## 7. Test, then go live
1. Back office → **Crate → + List a record** → list a test record at $1.
2. On the Crate page buy it with card `4242 4242 4242 4242`, any future date, any CVC.
3. Check: the record shows **SOLD**, and **Orders** shows it with the shipping address.
4. Delete the test listing. Then repeat steps 2 and 4 in **live mode** (new `rk_live_…` key and a live webhook + its `whsec_…`), replacing the two secrets.

## Selling day to day
- **List:** Crate → + List a record → photos (drag in, first = cover), details, grades, price → Publish.
- **Draft:** set Status to "Draft / hidden" to prep listings privately.
- **Sold in person?** Click **Mark sold**. **Relist** puts it back.
- **Ship:** Orders → vinyl orders show the address → after posting, **Mark shipped** + tracking number.
- A record in someone's checkout shows **On hold** for up to 30 minutes, then returns to sale if they don't pay.
- Link straight to one record: open it on the Crate page and copy the address (`crate.html?record=…`).
