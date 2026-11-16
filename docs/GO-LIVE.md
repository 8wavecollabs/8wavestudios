# Putting the beat store online

You'll create two free accounts (Supabase for the database, Netlify for hosting), then point your Squarespace domain at Netlify.
Nobody else needs your passwords at any step.

## 1. Supabase (database, login, audio)
1. Sign up at https://supabase.com → **New project**. Pick a name, a strong database password (save it), and the region closest to your listeners.
2. **Authentication → Users → Add user → Create new user**: your email + a password. This is your back office login.
3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up" so nobody else can make an account.
4. Open `supabase/schema.sql`, change `you@example.com` on the last line to the email from step 2.
5. **SQL Editor → New query**, paste the whole file, click **Run**. It should say "Success".
6. **Project Settings → API**: copy the **Project URL** and the **anon public** key into `js/config.js`:
   ```js
   supabaseUrl: 'https://abcdefgh.supabase.co',
   supabaseAnonKey: 'eyJhbGciOi...',
   ```
   (The anon key is designed to be public. Never paste the `service_role` key anywhere in the site.)

## 2. Upload your beats (from your computer, drive plugged in)
1. Start the local server: `powershell -ExecutionPolicy Bypass -File serve.ps1 -Media "D:\Hiphopbeats"`
2. Open http://localhost:8080/admin.html and sign in with your Supabase login.
3. **Settings**: set your producer name, tagline, prices and Stripe links → **Save settings**.
4. **Upload → Import to store**. Each beat gets a 75-second preview (~0.9 MB) uploaded; your full files stay on your drive.
   All 681 take roughly 40–60 minutes. Keep the tab open; if anything fails, click Import again and it continues where it left off.

## 3. Netlify (hosting)
1. Run `powershell -ExecutionPolicy Bypass -File tools\build-dist.ps1` — it creates a `dist` folder with just the website files.
2. Sign up at https://app.netlify.com → **Add new site → Deploy manually** → drag the `dist` folder in.
3. You get a test address like `https://random-name.netlify.app`. Check the store and `/admin.html` there.
4. To update the site later: rebuild `dist` and drag it into **Deploys** on the same site.

## 4. Connect your Squarespace domain
1. Netlify: **Domain management → Add a domain** → type your domain (e.g. `yourbeats.com`). Netlify shows the DNS records to add.
2. Squarespace: **Domains → your domain → DNS → DNS Settings**.
   - Remove the default Squarespace records for `@` and `www` (only if this domain isn't running a Squarespace site you want to keep).
   - Add **A** record: host `@` → `75.2.60.5` (Netlify's load balancer — use whatever Netlify shows you).
   - Add **CNAME** record: host `www` → `random-name.netlify.app`.
3. Back in Netlify, wait for "DNS verified", then **HTTPS → Verify DNS / Provision certificate**. Can take up to 24 hours, usually under one.

## Free tier limits to know
- Supabase free: 1 GB file storage (your previews ≈ 600 MB), 500 MB database, project pauses after 7 days with no visits (one click to resume). Pro is $25/month if you outgrow it.
- Netlify free: 100 GB bandwidth/month for the site files (audio streams from Supabase, not Netlify).
