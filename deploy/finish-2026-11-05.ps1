# Brings the work of 2026-11-05 (evening) from its branch into main and the production server, checking it first (the session that wrote it had no npm
# registry, so it could not run tsc, the tests or a build itself). Run from the repo, in a PowerShell window:
#   powershell -ExecutionPolicy Bypass -File deploy\finish-2026-11-05.ps1
# 1. Fetches. The files that session copied into this working tree by hand (the scripts, architecture.ts, the test, the models) are saved to a folder under
#    %TEMP% and put back as main has them, so that the branch can be checked out (nothing else in the working tree is touched: Alert.tsx stays as it is).
# 2. Checks out the branch (detached) and runs `npx tsc --noEmit`, `npm test` and a Vite build into a scratch folder.
# 3. Only if all three pass: fast-forwards main to the branch, pushes main, and runs deploy\windows-start.ps1 -Mode prod (build, migrations, restart on 5000).
#    If anything fails it goes back to main, says what failed, and leaves the service as it was. The whole run is logged to tools\refs\cache\finish-2026-11-05.log.
param([string]$Branch = 'nov5-wiring')
# (Continue, not Stop: Windows PowerShell 5.1 turns a native command's stderr into a terminating error under Stop; failures are caught by exit codes)
$ErrorActionPreference = 'Continue'
$Repo = Split-Path -Parent $PSScriptRoot
Set-Location $Repo
New-Item -ItemType Directory -Force -Path (Join-Path $Repo 'tools\refs\cache') | Out-Null
$Log = Join-Path $Repo 'tools\refs\cache\finish-2026-11-05.log'
Start-Transcript -Path $Log -Force | Out-Null
function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Run([string]$file, [string[]]$arguments) {
  & $file @arguments
  if ($LASTEXITCODE -ne 0) { throw "$file $($arguments -join ' ') failed (exit $LASTEXITCODE)" }
}
$ok = $false
try {
  Step "Fetching origin"
  Run 'git' @('fetch', 'origin')
  if ((git rev-parse --abbrev-ref HEAD) -ne 'main') { throw "This expects to start on main (it is on $(git rev-parse --abbrev-ref HEAD))." }
  git merge-base --is-ancestor HEAD "origin/$Branch"
  if ($LASTEXITCODE -ne 0) { throw "origin/$Branch does not follow main: not a fast-forward." }

  Step "Setting aside the hand-copied files the branch brings"
  $backup = Join-Path $env:TEMP ("sw5e-finish-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  $paths = @(git diff --name-only HEAD "origin/$Branch")
  foreach ($p in $paths) {
    if (-not (Test-Path -LiteralPath $p)) { continue }
    $dest = Join-Path $backup $p
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
    Copy-Item -LiteralPath $p -Destination $dest -Force
    git ls-files --error-unmatch -- $p 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { Run 'git' @('checkout', 'HEAD', '--', $p) } else { Remove-Item -LiteralPath $p -Force }
  }
  Write-Host "Saved to $backup"

  Step "Checking out origin/$Branch"
  Run 'git' @('switch', '--detach', "origin/$Branch")

  Step "Type check (npx tsc --noEmit)"
  Run 'npx' @('tsc', '--noEmit')
  Step "Tests (npm test)"
  Run 'npm' @('test')
  Step "Vite build into a scratch folder"
  $scratch = Join-Path $env:TEMP 'sw5e-vite-check'
  $out = & npx vite build --outDir $scratch --emptyOutDir 2>&1 | Out-String
  Write-Host $out
  if ($LASTEXITCODE -ne 0) { throw "vite build failed" }
  if ($out -match '\(!\)|warning') { Write-Host "Vite printed warnings (see above): CLAUDE.md asks for none; fix them in the next session." -ForegroundColor Yellow }

  Step "Fast-forwarding main and pushing"
  Run 'git' @('switch', 'main')
  Run 'git' @('merge', '--ff-only', "origin/$Branch")
  Run 'git' @('push', 'origin', 'main')
  $ok = $true
} catch {
  Write-Host "`nSTOPPED: $_" -ForegroundColor Red
  if ((git rev-parse --abbrev-ref HEAD) -ne 'main') { git switch main | Out-Null }
  Write-Host "main and the server are as they were. The log is $Log." -ForegroundColor Red
}
Stop-Transcript | Out-Null
if ($ok) {
  Step "Building and restarting the production server"
  & (Join-Path $PSScriptRoot 'windows-start.ps1') -Mode prod
} else {
  exit 1
}
