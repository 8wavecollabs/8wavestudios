# 8 Wave Studios store (8wavestudios.com)

Recovered on 2026-11-16.

- `site/`: the live site as published on Netlify (project `stupendous-quokka-bb0134`).
  - `index.html`: the beat store
  - `admin.html`: the Back Office (manage beats, orders, subscribers)
  - `js/config.js`: Supabase connection (public key only)
- `supabase/`: the back end (Supabase project `mchpykpjjingtbmwqxjl`)
  - `functions/crate-checkout`: vinyl ("crate") checkout through Stripe
  - `functions/stripe-webhook`: marks vinyl sold and saves beat and vinyl orders after payment
  - `sql/schema.sql`: tables, functions, security rules and storage buckets

## Not recovered yet

- `crate.html`, the vinyl records page. It was never published to the live site (404),
  so it only exists in the Oct 26 desktop-app scratch folder on the Windows computer.

## Known issue

`stripe-webhook` is deployed with "Verify JWT" ON. Stripe can't send a Supabase login,
so its payment events are rejected. Redeploy it with Verify JWT OFF.
