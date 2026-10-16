$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcherPath = Join-Path $scriptRoot 'output/RainbowVideoWorkbench.exe'
if (Test-Path -LiteralPath $launcherPath) {
    Start-Process -FilePath $launcherPath -WorkingDirectory $scriptRoot -WindowStyle Hidden
} else {
    & python (Join-Path $scriptRoot 'launcher.py')
}
