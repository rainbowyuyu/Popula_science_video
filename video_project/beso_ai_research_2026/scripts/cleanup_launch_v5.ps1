<#
Default: PLAN ONLY. No files removed and no evidence archived.
Apply only after final v5 technical QA passes and matches the actual final SHA.
Only exact launch-render and launch bundle/public COPY caches under output/tmp
are eligible. No public/source/audio/work/node_modules data are candidates.
#>
[CmdletBinding()]
param(
    [switch]$Apply,
    [ValidatePattern('^[0-9a-f]{12}$')][string]$CurrentRevision = 'bd1dd83d6aad',
    [string]$ProjectRoot = (Join-Path $PSScriptRoot '..')
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $ProjectRoot).Path.TrimEnd('\')
$outRoot = Join-Path $root 'output'
$tmpRoot = Join-Path $root 'tmp'
$qaRoot = Join-Path $root 'research/qa'
$final = Join-Path $outRoot 'ai_engineer_launch_v5_1080p60.mp4'
$qaFile = Join-Path $qaRoot 'launch-v5-delivery.json'
$currentDir = Join-Path $outRoot ('launch-v5-render-' + $CurrentRevision)
$planFile = Join-Path $qaRoot 'launch-v5-cleanup-plan.json'
$executedFile = Join-Path $qaRoot 'launch-v5-cleanup-executed.json'
$archiveRoot = Join-Path $qaRoot ('retired-render-evidence/' + $CurrentRevision)

function Is-Below([string]$Path, [string]$Base) {
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    $baseFull = [IO.Path]::GetFullPath($Base).TrimEnd('\')
    return $full.StartsWith($baseFull + '\', [StringComparison]::OrdinalIgnoreCase)
}
function Assert-SafeCandidate([string]$Path) {
    $p = (Resolve-Path -LiteralPath $Path).Path.TrimEnd('\')
    if (-not ((Is-Below $p $outRoot) -or (Is-Below $p $tmpRoot))) { throw 'Candidate is outside output/tmp.' }
    $item = Get-Item -LiteralPath $p -Force
    if (-not $item.PSIsContainer) { throw 'Only enumerated cache directories may be removed.' }
    $allowedOutput = $item.Name -match '^launch-v5-render-[0-9a-f]{12}$'
    $allowedTmp = $item.Name -match '^launch-v5-(?:bundle|public)-[0-9a-f]{12}$'
    if ((Is-Below $p $outRoot) -and -not $allowedOutput) { throw 'Output directory name is outside the cache allowlist.' }
    if ((Is-Below $p $tmpRoot) -and -not $allowedTmp) { throw 'Temporary directory name is outside the cache allowlist.' }
    if ($item.Name -match ('-' + [regex]::Escape($CurrentRevision) + '$')) { throw 'Current render revision is protected.' }
    # Reject junctions/symlinks at every ancestor and within the full target.
    $walk = $item
    while ($null -ne $walk -and $walk.FullName -ne $root) {
        if (($walk.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse-point candidate/ancestor rejected.' }
        $walk = $walk.Parent
    }
    if ($null -eq $walk) { throw 'Candidate ancestry did not reach the project root.' }
    foreach ($child in @(Get-ChildItem -LiteralPath $p -Force -Recurse)) {
        if (($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse point inside cache rejected.' }
        if ($child.Name -eq '.git') { throw 'Embedded repository inside cache rejected.' }
    }
    return $p
}
function Size-Bytes([string]$Path) {
    $sum = (Get-ChildItem -LiteralPath $Path -File -Force -Recurse | Measure-Object -Property Length -Sum).Sum
    if ($null -eq $sum) { return [long]0 }
    return [long]$sum
}

if (-not (Test-Path -LiteralPath $qaRoot)) { New-Item -ItemType Directory -Path $qaRoot | Out-Null }
$targets = @()
foreach ($base in @($outRoot,$tmpRoot)) {
    foreach ($dir in @(Get-ChildItem -LiteralPath $base -Directory -Force)) {
        $eligible = if ($base -eq $outRoot) { $dir.Name -match '^launch-v5-render-[0-9a-f]{12}$' } else { $dir.Name -match '^launch-v5-(?:bundle|public)-[0-9a-f]{12}$' }
        if (-not $eligible -or $dir.Name -match ('-' + [regex]::Escape($CurrentRevision) + '$')) { continue }
        $safe = Assert-SafeCandidate $dir.FullName
        $targets += [pscustomobject]@{path=$safe;bytes=(Size-Bytes $safe);kind=if($base -eq $outRoot){'retired-render'}else{'rebuildable-runtime-copy'}}
    }
}
$sumBytes = [long](($targets | Measure-Object -Property bytes -Sum).Sum)
$protectedMovies = @(Get-ChildItem -LiteralPath $outRoot -File -Filter '*.mp4' | ForEach-Object {$_.FullName})
$plan = [ordered]@{
    mode='plan-only';createdAt=[DateTime]::UtcNow.ToString('o');project=$root;protectedRevision=$CurrentRevision
    finalQARequired=$qaFile;finalFileRequired=$final;actualSHARequired=$true
    protected=@($currentDir,(Join-Path $tmpRoot ('launch-v5-bundle-' + $CurrentRevision)),(Join-Path $tmpRoot ('launch-v5-public-' + $CurrentRevision)),'src/','public/','audio/','research/','work/','delivery/','node_modules/')
    protectedMovies=$protectedMovies;candidates=$targets;candidateBytes=$sumBytes;candidateGiB=[math]::Round($sumBytes/1GB,3)
    archiveBeforeDelete='Every retired render top-level manifest/QA JSON/log/text/contact and entire stills directory are copied and SHA-256 verified before removing that directory.'
    estimateLimit='Net recovered bytes are less than candidates by the small archived QA evidence copies; current render grows independently.'
    applied=$false
}
$plan | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $planFile -Encoding utf8
if (-not $Apply) {
    [pscustomobject]@{mode='PLAN ONLY';candidateCount=$targets.Count;candidateGiB=$plan.candidateGiB;protectedRevision=$CurrentRevision;plan=$planFile} | ConvertTo-Json
    exit 0
}

# Final QA gates are checked immediately before any copy/delete mutation.
if (-not (Test-Path -LiteralPath $qaFile -PathType Leaf)) { throw 'Final QA report is absent; nothing removed.' }
if (-not (Test-Path -LiteralPath $final -PathType Leaf)) { throw 'Final v5 MP4 is absent; nothing removed.' }
$qa = Get-Content -LiteralPath $qaFile -Raw | ConvertFrom-Json
if ($qa.passed -ne $true -or $qa.fullDecodePassed -ne $true -or @($qa.errors).Count -ne 0) { throw 'Final QA failed or incomplete; nothing removed.' }
if ([IO.Path]::GetFullPath([string]$qa.file) -ne [IO.Path]::GetFullPath($final)) { throw 'QA report is for a different final file; nothing removed.' }
$actualSHA = (Get-FileHash -LiteralPath $final -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualSHA -ne ([string]$qa.sha256).ToLowerInvariant()) { throw 'Final SHA does not match checked delivery; nothing removed.' }
$currentManifest = Join-Path $currentDir 'render-manifest.json'
if (-not (Test-Path -LiteralPath $currentManifest -PathType Leaf)) { throw 'Protected current render manifest is absent; nothing removed.' }
$manifest = Get-Content -LiteralPath $currentManifest -Raw | ConvertFrom-Json
if ($manifest.revision -ne $CurrentRevision -or -not $manifest.finished -or $manifest.durationInFrames -ne 6300) { throw 'Current render is incomplete or not the intended 6300-frame film; nothing removed.' }
if ([IO.Path]::GetFullPath([string]$manifest.final) -ne [IO.Path]::GetFullPath($final)) { throw 'Current render does not name the checked final delivery; nothing removed.' }
foreach ($necessary in @('src/index-launch-v5.tsx','public/audio/launch-v5-master.wav','public/beso-research/physics/native-model.json','public/beso-research/physics/zwind-response.json','research/generation/qwen-v4-tasks.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $necessary))) { throw ('Protected source dependency absent: ' + $necessary) }
}
if (-not (Is-Below $archiveRoot $qaRoot)) { throw 'Evidence archive path is outside research/qa.' }
foreach ($proc in @(Get-CimInstance Win32_Process)) {
    if ($proc.ProcessId -ne $PID -and $proc.Name -match '^node(?:\.exe)?$' -and $proc.CommandLine -match 'render_launch_v5\.mjs') { throw 'Active v5 renderer found; nothing removed.' }
}
$archived = @();$removed = @();$archivedBytes = [long]0
foreach ($candidate in $targets) {
    if (-not (Test-Path -LiteralPath $candidate.path)) { continue }
    $safe = Assert-SafeCandidate $candidate.path
    if ($candidate.kind -eq 'retired-render') {
        $archiveDir = Join-Path $archiveRoot (Split-Path -Path $safe -Leaf)
        $files = @(Get-ChildItem -LiteralPath $safe -File -Force | Where-Object {$_.Extension -in @('.json','.log','.txt','.md') -or $_.Name -match '(?:contact|transition).*\.(?:jpg|png)$'})
        $stillsDir = Join-Path $safe 'stills'
        if (Test-Path -LiteralPath $stillsDir) { $files += @(Get-ChildItem -LiteralPath $stillsDir -File -Force -Recurse) }
                $contactDir = Join-Path $safe 'independent-contact'
        if (Test-Path -LiteralPath $contactDir) { $files += @(Get-ChildItem -LiteralPath $contactDir -File -Force -Recurse) }
        foreach ($source in $files) {
            $rel = [IO.Path]::GetRelativePath($safe,$source.FullName)
            $dest = [IO.Path]::GetFullPath((Join-Path $archiveDir $rel))
            if (-not (Is-Below $dest $archiveRoot)) { throw 'Archive file escaped its intended directory.' }
            $parent = Split-Path -Path $dest -Parent
            if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
            Copy-Item -LiteralPath $source.FullName -Destination $dest -Force
            $hash = (Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash
            if ($hash -ne (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash) { throw 'Evidence archive hash mismatch; target not removed.' }
            $archived += [pscustomobject]@{original=$source.FullName;archive=$dest;sha256=$hash.ToLowerInvariant();bytes=$source.Length}
            $archivedBytes += $source.Length
        }
    }
    $safe = Assert-SafeCandidate $safe
    $bytes = Size-Bytes $safe
    Remove-Item -LiteralPath $safe -Recurse -Force
    $removed += [pscustomobject]@{path=$safe;bytes=$bytes}
}
if ((Get-FileHash -LiteralPath $final -Algorithm SHA256).Hash.ToLowerInvariant() -ne $actualSHA) { throw 'Final hash unexpectedly changed after cache cleanup.' }
$totalRemoved = [long](($removed | Measure-Object -Property bytes -Sum).Sum)
$execution = [ordered]@{mode='applied';finishedAt=[DateTime]::UtcNow.ToString('o');protectedRevision=$CurrentRevision;finalSHA256=$actualSHA;finalQA=$qaFile;archived=$archived;removed=$removed;removedBytes=$totalRemoved;archivedBytes=$archivedBytes;estimatedNetRecoveredBytes=($totalRemoved-$archivedBytes);protectedMovies=$protectedMovies}
$execution | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $executedFile -Encoding utf8
[pscustomobject]@{mode='APPLIED';removedDirectories=$removed.Count;estimatedNetRecoveredGiB=[math]::Round(($totalRemoved-$archivedBytes)/1GB,3);finalSHA256=$actualSHA;report=$executedFile} | ConvertTo-Json
