<#
Post-render V14 delivery gate.

Run from the glp1_nobel_2026 project directory after the Remotion render has
finished. The script does not start, stop, or modify the render process. It
decodes the completed file, records ffprobe metadata, verifies the timeline,
and copies the four primary V14 cover files into delivery/封面-V14.
#>
[CmdletBinding()]
param(
  [string]$Video = "delivery\如何科学减肥_从身体调节说起_V14_1080p.mp4",
  [string]$QaDir = "tmp\v14-qa"
)

$ErrorActionPreference = 'Stop'
# Resolve paths from this script so it can be called from any working directory.
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $root
$videoPath = [IO.Path]::GetFullPath((Join-Path $root $Video))
$qaPath = [IO.Path]::GetFullPath((Join-Path $root $QaDir))
$coverSource = [IO.Path]::GetFullPath((Join-Path $root 'research\revision-v14\covers'))
$coverDest = [IO.Path]::GetFullPath((Join-Path $root 'delivery\封面-V14'))

if (-not (Test-Path -LiteralPath $videoPath -PathType Leaf)) {
  throw "V14 render not found: $videoPath"
}
if (-not (Test-Path -LiteralPath (Join-Path $root 'src\timeline.json') -PathType Leaf)) {
  throw 'src/timeline.json is missing; refuse to run the delivery gate.'
}

New-Item -ItemType Directory -Force -Path $qaPath | Out-Null

Write-Host '[1/5] npm typecheck'
npm run check

Write-Host '[2/5] timeline, black-frame and frame extraction verification'
python scripts\verify_video_v8.py --video $Video --out $QaDir

Write-Host '[3/5] ffprobe media contract'
$probeJson = Join-Path $qaPath 'ffprobe-v14.json'
& ffprobe -v error -show_streams -show_chapters -show_format -of json $videoPath | Set-Content -Encoding utf8 $probeJson
if ($LASTEXITCODE -ne 0) { throw "ffprobe failed with exit code $LASTEXITCODE" }

$probe = Get-Content -Raw -LiteralPath $probeJson | ConvertFrom-Json
$v = @($probe.streams | Where-Object { $_.codec_type -eq 'video' })[0]
$a = @($probe.streams | Where-Object { $_.codec_type -eq 'audio' })[0]
if ($null -eq $v -or $null -eq $a) { throw 'Expected one video stream and one audio stream.' }
if ([int]$v.width -ne 1920 -or [int]$v.height -ne 1080) { throw "Unexpected video size: $($v.width)x$($v.height)" }
if ($v.r_frame_rate -ne '30/1') { throw "Unexpected frame rate: $($v.r_frame_rate)" }
if ($v.pix_fmt -ne 'yuv420p') { throw "Unexpected pixel format: $($v.pix_fmt)" }
if ($a.sample_rate -ne '48000') { throw "Unexpected audio rate: $($a.sample_rate)" }
if ($v.color_space -ne 'bt709' -or $v.color_transfer -ne 'bt709' -or $v.color_primaries -ne 'bt709') {
  throw 'Expected BT.709 video signalling.'
}
Write-Host ("  {0}x{1} @ {2}; audio {3} Hz; duration {4}s" -f $v.width,$v.height,$v.r_frame_rate,$a.sample_rate,$probe.format.duration)

Write-Host '[4/5] full ffmpeg decode'
$decodeLog = Join-Path $qaPath 'full-decode.log'
& ffmpeg -hide_banner -nostdin -v error -xerror -i $videoPath -f null - 2> $decodeLog
if ($LASTEXITCODE -ne 0) { throw "Full ffmpeg decode failed; see $decodeLog" }

Write-Host '[5/5] copy primary V14 covers'
New-Item -ItemType Directory -Force -Path $coverDest | Out-Null
$coverMap = @{
  'cardiometabolic-cover-16x9.jpg' = '如何科学减肥_身体调节_16x9.jpg'
  'cardiometabolic-cover-4x3.jpg'  = '如何科学减肥_身体调节_4x3.jpg'
  'cardiometabolic-cover-3x4.jpg'  = '如何科学减肥_身体调节_3x4.jpg'
  'cardiometabolic-cover-9x16.jpg' = '如何科学减肥_身体调节_9x16.jpg'
}
foreach ($name in $coverMap.Keys) {
  $src = Join-Path $coverSource $name
  if (-not (Test-Path -LiteralPath $src -PathType Leaf)) { throw "Missing V14 cover: $src" }
  Copy-Item -LiteralPath $src -Destination (Join-Path $coverDest $coverMap[$name]) -Force
}

$manifest = [ordered]@{
  video = $videoPath
  probe = $probeJson
  qa = $qaPath
  decode = $decodeLog
  covers = $coverDest
  status = 'technical-pass; visual review remains manual'
  generatedAt = (Get-Date).ToString('o')
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 (Join-Path $qaPath 'delivery-gate-v14.json')
Write-Host "V14 technical delivery gate passed. QA: $qaPath"
