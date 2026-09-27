param(
  [string]$ApiKey = $env:GIPHY_BUILD_KEY,
  [string]$OutFile = (Join-Path (Split-Path $PSScriptRoot -Parent) "gifs.json")
)

if (-not $ApiKey) { throw "Pass -ApiKey or set `$env:GIPHY_BUILD_KEY (get a free key at developers.giphy.com)" }

$ClassicTerms = @('mic drop','thumbs up','clapping','facepalm','eye roll','applause','dance party','high five','mind blown','slow clap','fist bump','shrug')

function Convert-Item($item) {
  $img = $item.images
  $mp4 = $null
  if ($img.original_mp4 -and $img.original_mp4.mp4) { $mp4 = $img.original_mp4.mp4 }
  elseif ($img.looping -and $img.looping.mp4) { $mp4 = $img.looping.mp4 }
  if (-not $mp4) { return $null }
  $still = $img.original.url
  if (-not $still) { $still = $img.downsized.url }
  $w = [int]($img.original.width); if (-not $w) { $w = 480 }
  $h = [int]($img.original.height); if (-not $h) { $h = 270 }
  [pscustomobject]@{
    id = $item.id
    title = $item.title
    thumb = $img.fixed_width_small.url
    mp4 = $mp4
    still = $still
    width = $w
    height = $h
  }
}

Write-Host "Fetching trending..."
$trendingRes = Invoke-RestMethod -Uri "https://api.giphy.com/v1/gifs/trending?api_key=$ApiKey&limit=50&rating=g" -TimeoutSec 20
$trending = $trendingRes.data | ForEach-Object { Convert-Item $_ } | Where-Object { $_ }

$classic = @()
foreach ($term in $ClassicTerms) {
  Write-Host "Fetching classic term: $term"
  $enc = [uri]::EscapeDataString($term)
  $res = Invoke-RestMethod -Uri "https://api.giphy.com/v1/gifs/search?api_key=$ApiKey&q=$enc&limit=6&rating=g" -TimeoutSec 20
  $items = $res.data | ForEach-Object { Convert-Item $_ } | Where-Object { $_ }
  $classic += $items
  Start-Sleep -Milliseconds 400
}

# de-dupe by id within each list
$trending = $trending | Sort-Object id -Unique
$classic = $classic | Sort-Object id -Unique

$out = [pscustomobject]@{
  generatedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
  trending = $trending
  classic = $classic
}

$out | ConvertTo-Json -Depth 6 | Set-Content -Path $OutFile -Encoding UTF8
Write-Host "Wrote $($trending.Count) trending + $($classic.Count) classic to $OutFile"
