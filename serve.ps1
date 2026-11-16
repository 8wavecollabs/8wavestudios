# Serves this folder at http://localhost:8080 (store) and http://localhost:8080/admin.html (back office).
# Audio from your beats folder is served under /drive/ so imported tracks play straight off the hard drive.
# Run:  powershell -ExecutionPolicy Bypass -File serve.ps1 -Media "D:\Hiphopbeats"
param([int]$Port = 8080, [string]$Media = 'D:\Hiphopbeats')
$root = Join-Path $PSScriptRoot 'site'
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.svg'='image/svg+xml'; '.png'='image/png'; '.json'='application/json';
  '.mp3'='audio/mpeg'; '.wav'='audio/wav'; '.m4a'='audio/mp4'; '.flac'='audio/flac'; '.aif'='audio/aiff'; '.aiff'='audio/aiff' }
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Store:       http://localhost:$Port/"
Write-Host "Back office: http://localhost:$Port/admin.html"
Write-Host "Media:       $Media"
Write-Host "Ctrl+C to stop."
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $req = $ctx.Request; $res = $ctx.Response
      # RawUrl keeps %23 intact (Url.AbsolutePath mangles '#' in names like F#min)
      $path = [Uri]::UnescapeDataString(($req.RawUrl -split '\?')[0].TrimStart('/'))
      if (-not $path) { $path = 'index.html' }
      $base = $root
      if ($path -like 'drive/*') { $base = $Media.TrimEnd('\'); $path = $path.Substring(6) }
      $file = [IO.Path]::GetFullPath([IO.Path]::Combine($base, $path.Replace('/', '\')))
      if ($file.StartsWith($base, [StringComparison]::OrdinalIgnoreCase) -and [IO.File]::Exists($file)) {
        $ext = [IO.Path]::GetExtension($file).ToLower()
        $res.ContentType = if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' }
        $res.AddHeader('Accept-Ranges', 'bytes')
        $fs = [IO.File]::OpenRead($file)
        try {
          $len = $fs.Length; $start = 0; $end = $len - 1
          # Byte ranges let the audio player seek
          if ($req.Headers['Range'] -match '^bytes=(\d*)-(\d*)$') {
            if ($Matches[1]) { $start = [int64]$Matches[1] }
            if ($Matches[2]) { $end = [Math]::Min([int64]$Matches[2], $len - 1) }
            if (-not $Matches[1] -and $Matches[2]) { $start = $len - [int64]$Matches[2]; $end = $len - 1 }
            $res.StatusCode = 206
            $res.AddHeader('Content-Range', "bytes $start-$end/$len")
          }
          $res.ContentLength64 = $end - $start + 1
          if ($req.HttpMethod -ne 'HEAD') {
            $fs.Position = $start
            $buf = New-Object byte[] 65536; $left = $end - $start + 1
            while ($left -gt 0) {
              $n = $fs.Read($buf, 0, [Math]::Min($buf.Length, $left)); if ($n -le 0) { break }
              $res.OutputStream.Write($buf, 0, $n); $left -= $n
            }
          }
        } finally { $fs.Dispose() }
      } else { $res.StatusCode = 404 }
    } catch { Write-Host "Request error: $_" }
    try { $ctx.Response.Close() } catch {}
  }
} finally { $listener.Stop() }
