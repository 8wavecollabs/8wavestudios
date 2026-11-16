# Scans a beats folder, reads Title_Key_BPM from each filename, sorts into BPM categories,
# and writes catalog.json (imported by the back office) + catalog.csv (for you).
# Run:  powershell -ExecutionPolicy Bypass -File tools\build-catalog.ps1 -Source "D:\Hiphopbeats"
param([string]$Source = 'D:\Hiphopbeats')
$root = Join-Path (Split-Path $PSScriptRoot -Parent) 'site'

$bands = @(
  @{ id='slow'; label='Slow / Ballad';  min=0;   max=79 },
  @{ id='boom'; label='Boom Bap / R&B'; min=80;  max=99 },
  @{ id='mid';  label='Mid-tempo / Pop'; min=100; max=119 },
  @{ id='club'; label='Club / House';   min=120; max=135 },
  @{ id='trap'; label='Trap';           min=136; max=155 },
  @{ id='fast'; label='Drill / Fast';   min=156; max=999 }
)
$notes = @{ 'C'='C';'C#'='C#';'DB'='C#';'D'='D';'D#'='D#';'EB'='D#';'E'='E';'F'='F';'F#'='F#';'GB'='F#';'G'='G';'G#'='G#';'AB'='G#';'A'='A';'A#'='A#';'BB'='A#';'B'='B' }

function Parse-Key([string]$k) {
  if ($k -notmatch '^([A-Ga-g])([#b]?)(.*)$') { return $null }
  $note = $notes[($Matches[1] + $Matches[2]).ToUpper()]
  $rest = $Matches[3].ToLower()
  if (-not $note) { return $null }
  # maj / major / mixolydian / lydian read as major; everything else (min, phrygian, harmonic minor, alt, blank) as minor
  $mode = if ($rest -match '^(maj|mixo|lyd|ionian)' -or ($rest -eq '' -and $k -cmatch '^[A-G][#b]?$')) { 'major' } else { 'minor' }
  return "$note $mode"
}

$out = @(); $skipped = @()
Get-ChildItem -LiteralPath $Source -Recurse -File | Where-Object { $_.Extension -match '^\.(mp3|wav|aiff?|flac|m4a)$' } | ForEach-Object {
  $base = [IO.Path]::GetFileNameWithoutExtension($_.Name)
  $parts = $base -split '_' | Where-Object { $_ -ne '' }
  $bpm = $null; $key = $null; $title = $base; $version = ''
  if ($parts.Count -ge 2 -and $parts[-1] -match '^(\d{2,3})(?:\.\d+)?\s*(?:bpm)?\s*(v\d+|alt|remix)?$') {
    $bpm = [int]$Matches[1]
    if ($Matches[2]) { $version = $Matches[2].ToUpper() }
    $titleParts = $parts[0..($parts.Count - 2)]
    if ($titleParts.Count -ge 2) { $key = Parse-Key $titleParts[-1]; if ($key) { $titleParts = $titleParts[0..($titleParts.Count - 2)] } }
    $title = ($titleParts -join ' ')
  } else {
    # Loose names like "Crazy_Cmin_120instro" or "LASoul_F#minor94": take the last standalone 2-3 digit number in tempo range
    $nums = [regex]::Matches($base, '(?<![\d.!])(\d{2,3})(?:\.\d+)?(?!\d)') | ForEach-Object { [int]$_.Groups[1].Value } | Where-Object { $_ -ge 60 -and $_ -le 200 }
    if ($nums) {
      $bpm = @($nums)[-1]
      $title = $parts[0]
      foreach ($p in $parts[1..($parts.Count - 1)]) {
        if ($p -match '^[A-Ga-g][#b]?(maj|min|m(?![a-z])|phry|mixo|lyd|dor|alt|harm|flam|\d|$)') { $key = Parse-Key ($p -replace '\d.*$', ''); if ($key) { break } }
      }
      if (-not $key -and $base -match '([A-G])-(flat|sharp)\s+(major|minor)') { $key = Parse-Key ($Matches[1] + $(if ($Matches[2] -eq 'flat') { 'b' } else { '#' }) + $Matches[3].Substring(0, 3)) }
    }
  }
  # CamelCase -> words, keep version suffix
  $title = ($title -creplace '(?<=[a-z])(?=[A-Z])', ' ').Trim()
  if ($version) { $title = "$title ($version)" }
  $rel = $_.FullName.Substring($Source.TrimEnd('\').Length + 1)
  if (-not $bpm) {
    # Kept with bpm 0 so the back office detects tempo from the audio on import
    $skipped += $rel
    $out += [pscustomobject]@{ title=($parts[0] -creplace '(?<=[a-z])(?=[A-Z])', ' '); bpm=0; key=''; band=''; category='Needs BPM check'; file=$rel; sizeMB=[math]::Round($_.Length/1MB,1) }
    return
  }
  $band = $bands | Where-Object { $bpm -ge $_.min -and $bpm -le $_.max } | Select-Object -First 1
  $out += [pscustomobject]@{ title=$title; bpm=[int]$bpm; key=$(if ($key) { $key } else { '' }); band=$band.id; category=$band.label; file=$rel; sizeMB=[math]::Round($_.Length/1MB,1) }
}

$out = $out | Sort-Object bpm, title
[IO.File]::WriteAllText((Join-Path $root 'catalog.json'), (ConvertTo-Json @($out) -Depth 3), (New-Object Text.UTF8Encoding $false))
$out | Export-Csv (Join-Path $root 'catalog.csv') -NoTypeInformation -Encoding UTF8
"Parsed: $($out.Count - $skipped.Count)   Needs BPM from audio: $($skipped.Count)"
$out | Group-Object category | Sort-Object { ($bands | Where-Object label -eq $_.Name).min } | ForEach-Object { '{0,-18} {1,4} tracks' -f $_.Name, $_.Count }
"No key in filename: " + ($out | Where-Object { -not $_.key }).Count
if ($skipped) { "--- Could not read BPM from:"; $skipped }
