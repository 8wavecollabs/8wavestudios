# Copies only the files the public website needs into dist\ (no catalog, no scripts, no drive paths).
# Then drag the dist folder onto https://app.netlify.com/drop (or Netlify → Add new site → Deploy manually).
$root = Join-Path (Split-Path $PSScriptRoot -Parent) 'site'
$dist = Join-Path (Split-Path $PSScriptRoot -Parent) 'dist'
$cfg = Get-Content (Join-Path $root 'js\config.js') -Raw
if ($cfg -match "supabaseUrl:\s*''") { Write-Warning 'js\config.js has no Supabase URL yet - the live site would run in offline demo mode.' }
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force -Confirm:$false }
New-Item -ItemType Directory $dist | Out-Null
Copy-Item (Join-Path $root '*.html') $dist
Copy-Item (Join-Path $root 'css') $dist -Recurse
Copy-Item (Join-Path $root 'js') $dist -Recurse
"Ready: $dist"
Get-ChildItem $dist -Recurse -File | ForEach-Object { '  ' + $_.FullName.Substring($dist.Length + 1) }
