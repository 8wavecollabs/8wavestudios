# 8 Wave Studios store (8wavestudios.com)

Recovered on 2026-11-16 from the live site, Supabase, and the transcript of the
Oct 26 – Nov 7 desktop-app session that built it.

- `site/`: the website, hosted on Netlify (project `stupendous-quokka-bb0134`)
  - `index.html`: the beat store
  - `crate.html`: **The Crate**, the vinyl records page (not published yet)
  - `admin.html`: the Back Office (beats, crate listings, orders, subscribers)
  - `js/crate-admin.js`: the Back Office's crate listing editor
  - `js/config.js`: Supabase connection (public key only)
- `supabase/`: the back end (Supabase project `mchpykpjjingtbmwqxjl`)
  - `functions/crate-checkout`: vinyl checkout through Stripe
  - `functions/stripe-webhook`: marks vinyl sold and saves orders after payment
  - `schema.sql`, `crate.sql`: the original setup scripts
  - `sql/schema.sql`: snapshot of the live database as of 2026-11-16
  - `config.toml`: `stripe-webhook` runs with Verify JWT off (Stripe can't send a login)
- `tools/build-dist.ps1`: copies `site/` into `dist/` for a Netlify drag-and-drop deploy
- `docs/CRATE-SETUP.md`: one-time setup for the vinyl crate (Stripe keys, webhook)
- `docs/GO-LIVE.md`: how the site was first put online

## Status on 2026-11-16

- Live on 8wavestudios.com: the beat store and Back Office, without the Crate.
- Supabase already has everything the Crate needs (records table, `crate` photo bucket,
  both functions). `stripe-webhook` was redeployed with Verify JWT off.
- To launch the Crate: finish `docs/CRATE-SETUP.md` (Stripe secrets and webhook),
  then deploy `site/` to Netlify.
