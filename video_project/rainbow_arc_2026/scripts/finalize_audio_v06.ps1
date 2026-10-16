param([int]$NarrationProcessId = 0)
$ErrorActionPreference = 'Stop'
$rainbowRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $rainbowRoot
$rainbowPython = 'D:/python_project/tts/.venv/Scripts/python.exe'
Write-Output 'WAITING FOR THE EXISTING V06 TTS PROCESS; NO SECOND GPU JOB STARTED'
# Only wait for an explicitly supplied project process. Rebuilding saved takes
# uses the default 0; no unrelated process is queried or stopped.
while ($NarrationProcessId -gt 0 -and (Get-Process -Id $NarrationProcessId -ErrorAction SilentlyContinue)) { Start-Sleep -Seconds 3 }
if (-not (Test-Path -LiteralPath 'public/audio/narration.wav')) { throw 'Narration generation did not complete' }
Write-Output 'CORRECTING THE ONE SCIENTIFIC PHRASING CHANGE r035'
# Preserve the first take for review without overwriting it on later remixes.
$rainbowArchive = Join-Path $rainbowRoot 'research/audio/first-take-r035'
New-Item -ItemType Directory -Path $rainbowArchive -Force | Out-Null
foreach ($rainbowSource in @('public/audio/r035.wav','research/audio/raw/r035-raw.wav','research/audio/takes/r035.json')) {
    $rainbowArchiveTarget = Join-Path $rainbowArchive (Split-Path -Leaf $rainbowSource)
    if ((Test-Path -LiteralPath $rainbowSource) -and -not (Test-Path -LiteralPath $rainbowArchiveTarget)) { Copy-Item -LiteralPath $rainbowSource -Destination $rainbowArchive }
}
& $rainbowPython 'scripts/generate_audio.py' --only r035
if ($LASTEXITCODE -ne 0) { throw 'r035 synthesis failed' }
& $rainbowPython 'scripts/generate_audio.py' --timeline-only
if ($LASTEXITCODE -ne 0) { throw 'Final measured timeline failed' }
Write-Output 'FINAL MEASURED CLIP TIMELINE IS READY; ALIGNMENT WORKER WILL NOW FINISH'
& $rainbowPython 'scripts/score_mix_v06.py'
if ($LASTEXITCODE -ne 0) { throw 'Original score/master failed' }
# The alignment check refreshes the current story/audio hashes itself. An old
# report's existence is not treated as subtitle lock after an editorial change.
Write-Output 'REFRESHING CURRENT ASR SUBTITLES AND UNPROMPTED NUMERICAL/TERM CHECK'
& $rainbowPython 'scripts/audit_terms_v06.py'
if ($LASTEXITCODE -ne 0) { throw 'Unprompted terms verification failed' }
& $rainbowPython 'scripts/audit_audio_v06.py'
if ($LASTEXITCODE -ne 0) { throw 'Audio audit requires repair' }
Write-Output 'V06 AUDIO PIPELINE COMPLETE'
