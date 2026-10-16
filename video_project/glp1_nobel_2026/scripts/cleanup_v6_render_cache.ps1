$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if ($projectRoot -ne 'D:\python_project\manim_extend_rainbow\video_project\glp1_nobel_2026') { throw 'Unexpected project root' }
$final = Get-Content -LiteralPath (Join-Path $projectRoot 'research/revision-v5/finalization.json') -Raw | ConvertFrom-Json
$qa = Get-Content -LiteralPath (Join-Path $projectRoot 'research/qa/final-v5/automatic-report.json') -Raw | ConvertFrom-Json
$review = Get-Content -LiteralPath (Join-Path $projectRoot 'research/qa/final-v5/visual-review.json') -Raw | ConvertFrom-Json
$video = Join-Path $projectRoot 'delivery/GLP1_V5_1080p.mp4'
$digest = (Get-FileHash -LiteralPath $video -Algorithm SHA256).Hash.ToLowerInvariant()
if ($final.productionRevision -ne 'v6' -or !$qa.automaticChecksPass -or !$review.sampledVisualReviewCompleted -or $review.blockingIssues.Count -gt 0) { throw 'Final QA is incomplete' }
if ($digest -ne $final.videoSHA256 -or $digest -ne $qa.videoSHA256 -or $digest -ne $review.videoSHA256) { throw 'Final media identity differs' }
$relativeTargets = @(
    'tmp/v5-full-rtx-final/bundle',
    'tmp/v5-final-boundary-repair/bundle',
    'tmp/cover-mechanisms-v6-bundle',
    'tmp/v6-full-final/bundle',
    'tmp/v6-render-temp',
    'tmp/v6-continuity-patches/bundle',
    'tmp/v6-continuity-patches-r2/bundle'
)
$tmpRoot = (Resolve-Path -LiteralPath (Join-Path $projectRoot 'tmp')).Path + '\'
$processes = Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(node|chrome|ffmpeg|python)(\.exe)?$' }
$records = @()
foreach ($relative in $relativeTargets) {
    $literal = Join-Path $projectRoot $relative
    if (!(Test-Path -LiteralPath $literal)) { continue }
    $resolved = (Resolve-Path -LiteralPath $literal).Path
    if (!$resolved.StartsWith($tmpRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe target: $resolved" }
    $target = Get-Item -LiteralPath $resolved -Force
    if (!$target.PSIsContainer -or ($target.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Linked or non-directory target: $resolved" }
    $items = @(Get-ChildItem -LiteralPath $resolved -Force -Recurse)
    if (@($items | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw "Linked descendant in $resolved" }
    foreach ($item in $items) {
        if (!$item.FullName.StartsWith($resolved + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Descendant escapes target' }
    }
    foreach ($boundRelative in $final.inputsSHA256.PSObject.Properties.Name) {
        $bound = [IO.Path]::GetFullPath((Join-Path $projectRoot $boundRelative))
        if ($bound.StartsWith($resolved + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Final evidence resides inside cache: $boundRelative" }
    }
    if (@($processes | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($resolved) }).Count) { throw "Active process uses $resolved" }
    $files = @($items | Where-Object { !$_.PSIsContainer })
    $records += [pscustomobject]@{ path=$resolved; bytes=[long](($files | Measure-Object -Property Length -Sum).Sum); files=$files.Count }
}
# Every complete target is resolved and checked before any deletion begins.
foreach ($record in $records) {
    Remove-Item -LiteralPath $record.path -Recurse -Force
    if (Test-Path -LiteralPath $record.path) { throw "Cache deletion incomplete: $($record.path)" }
}
$report = [pscustomobject]@{
    completedUTC=[DateTime]::UtcNow.ToString('o')
    videoSHA256=$digest
    removed=$records
    bytesFreed=[long](($records | Measure-Object -Property bytes -Sum).Sum)
    preserved='Source, frozen snapshots, audio, rendered MP4s, patch videos, markers, reports and all review images'
}
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $projectRoot 'research/revision-v6/cache-cleanup-completed.json') -Encoding utf8
$report | Select-Object bytesFreed,@{Name='directories';Expression={$_.removed.Count}} | ConvertTo-Json
