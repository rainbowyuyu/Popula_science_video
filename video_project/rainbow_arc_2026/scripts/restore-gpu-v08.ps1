$ErrorActionPreference = 'Stop'
$episodeRoot = Split-Path -Parent $PSScriptRoot
$snapshot = Get-Content -LiteralPath (Join-Path $episodeRoot 'work/gpu-preference-before-v08.json') -Raw | ConvertFrom-Json
$gpuKey = 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences'
if ($null -eq $snapshot.oldValue) {
    Remove-ItemProperty -LiteralPath $gpuKey -Name $snapshot.exe -ErrorAction SilentlyContinue
} else {
    New-ItemProperty -LiteralPath $gpuKey -Name $snapshot.exe -Value $snapshot.oldValue -PropertyType String -Force | Out-Null
}
$current = (Get-Item -LiteralPath $gpuKey).GetValue($snapshot.exe, $null)
if ($current -ne $snapshot.oldValue) { throw 'GPU preference did not restore' }
@{restored=$true; previousValueRestored=$true; changedOnlyEpisodeBrowser=$true} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $episodeRoot 'research/qa/gpu-preference-restored-v08.json')
Write-Output 'Episode browser GPU preference restored.'

