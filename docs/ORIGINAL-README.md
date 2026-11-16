# Beat Store

Storefront + email list + AI hook writer + producer back office. No build step.

## Run
```
powershell -ExecutionPolicy Bypass -File serve.ps1
```
- Store: http://localhost:8080/
- Back office: http://localhost:8080/admin.html

## Files
- `index.html` — landing page: trending beat, catalog with filters, license picker, cart/checkout, newsletter signup, hook writer
- `admin.html` — dashboard (plays, trending, upload suggestions), drag & drop upload (files or whole folders), tracks, subscribers, orders, settings
- `js/db.js` — IndexedDB storage, license tiers, BPM categories
- `js/analyze.js` — in-browser BPM / key / energy / mood detection
- `js/hooks.js` — hook generator + Suno style/lyrics prompts

## Hard drive tracks
`tools/build-catalog.ps1 -Source "D:\Hiphopbeats"` reads `Title_Key_BPM.mp3` names into `catalog.json` / `catalog.csv`,
sorted into BPM categories. In the back office, Upload → **Import to store** adds them; audio streams from the drive via `/drive/`.
Run the script again after adding beats, then import again (only new files are added).

## Stripe setup
1. Sign up at https://dashboard.stripe.com/register and finish account activation (bank + ID), so you can take live payments.
2. **Product catalog → + Add product**, one per license: Premium WAV $51, Premium Stems $101, Unlimited $201,
   Full Monetization + Sync $401, Exclusive $2,499 (one-time prices).
3. On each product: **Create payment link**. In its options:
   - turn on **Collect customers' email** (it's prefilled from the store)
   - optional: **Allow promotion codes** (for subscriber discounts)
   - After payment → custom message, e.g. "Your files will be emailed within 24 hours."
4. Copy each link (`https://buy.stripe.com/...`) into Back office → Settings → the matching license → **Save settings**.
5. Test first: create the same links in **Test mode** and pay with card `4242 4242 4242 4242`, any future date, any CVC.
   Then swap in the live links.

To see which beat was bought: Back office → **Orders** lists the beat, license, email and price for every checkout
sent to Stripe. Match it to the payment in Stripe → **Payments** (same email and amount). The beat is also stored on the
Stripe Checkout Session as `client_reference_id` (e.g. `BillionaireBoys_Fsmin_140__sync`), visible in Workbench → Events.
Stripe emails the receipt; you send the files (e.g. a Google Drive / Dropbox link) — automatic delivery needs a server + Stripe webhook.

## Before going live
- **Payments:** create a Stripe Payment Link per license and paste them in Settings. Without links, checkout is demo mode.
- **Email:** paste a Mailchimp/ConvertKit/Formspree form URL in Settings, or export subscribers as CSV.
- **Hosting & login:** data currently lives in the browser (IndexedDB). For a public site, tracks, plays and subscribers need a real backend + database, and the back office needs a real login.
