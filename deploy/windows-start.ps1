# Starts a game server on this Windows PC with everything it needs, then opens the default browser.
#   prod  the game the user plays: port 5000, database sw5e, tailnet HTTPS on port 443 (built from the working tree).
#   test  a snapshot of the working tree for trying changes: port 5002, database sw5e_test (no showcase world),
#         built with the test menu, tailnet HTTPS on port 10000. The snapshot lives in %USERPROFILE%\sw5e-test.
# Starts Tailscale and PostgreSQL if they are stopped, installs packages if missing, stops the old server on the port,
# builds, applies migrations, starts the server hidden (it keeps running when the window closes), sets up Tailscale Serve.
# Logs: %LOCALAPPDATA%\sw5e\logs. Usage: powershell -ExecutionPolicy Bypass -File deploy\windows-start.ps1 -Mode prod|test
param([Parameter(Mandatory = $true)][ValidateSet('prod', 'test')][string]$Mode)

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot
$Logs = Join-Path $env:LOCALAPPDATA 'sw5e\logs'
New-Item -ItemType Directory -Force -Path $Logs | Out-Null

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }

function Invoke-Checked($file, $arguments) {
  & $file @arguments
  if ($LASTEXITCODE -ne 0) { throw "$file $($arguments -join ' ') failed with exit code $LASTEXITCODE" }
}

function Read-DotEnv($path) {
  $vars = @{}
  foreach ($line in Get-Content $path) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') { $vars[$matches[1]] = $matches[2].Trim('"', "'") }
  }
  return $vars
}

function Start-Postgres {
  $svc = Get-Service -Name 'postgresql*' | Select-Object -First 1
  if (-not $svc) { throw 'PostgreSQL service not found' }
  if ($svc.Status -ne 'Running') { Start-Service $svc.Name }
  Write-Host "PostgreSQL ($($svc.Name)) is running"
}

# Returns this machine's tailnet name (without the trailing dot)
function Start-Tailscale {
  if (-not (Get-Service Tailscale -ErrorAction SilentlyContinue)) { throw 'Tailscale is not installed' }
  if ((Get-Service Tailscale).Status -ne 'Running') { Start-Service Tailscale }
  $status = tailscale status --json | ConvertFrom-Json
  if ($status.BackendState -ne 'Running') {
    Write-Host "Tailscale is $($status.BackendState): running tailscale up (it may open a sign-in page)"
    Invoke-Checked 'tailscale' @('up')
    $status = tailscale status --json | ConvertFrom-Json
  }
  Write-Host "Tailscale is running as $($status.Self.DNSName.TrimEnd('.'))"
  return $status.Self.DNSName.TrimEnd('.')
}

# Stops the server on the port, but only if it is one of ours (node dist/index.js)
function Stop-GameServer($port) {
  $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $conn) { return }
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($conn.OwningProcess)"
  if ($proc.CommandLine -notmatch 'dist[\\/]index\.js') {
    throw "Port $port is used by $($proc.Name), which is not a built game server; stop it first"
  }
  Write-Host "Stopping the old server on port $port (pid $($conn.OwningProcess))"
  Stop-Process -Id $conn.OwningProcess -Force
  Start-Sleep -Seconds 1
}

function Start-GameServer($dir, $port, $name) {
  $out = Join-Path $Logs "$name.out.log"
  $err = Join-Path $Logs "$name.err.log"
  $node = (Get-Command node).Source
  $proc = Start-Process -FilePath $node -ArgumentList 'dist/index.js' -WorkingDirectory $dir -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $out -RedirectStandardError $err
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    if ($proc.HasExited) { throw "The server stopped at start; see $err" }
    try {
      $reply = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 3
      if ($reply.StatusCode -eq 200) { Write-Host "Server is up on port $port (pid $($proc.Id)); logs in $Logs"; return }
    } catch { }
  }
  throw "The server did not answer on port $port; see $err"
}

# A copy of the working tree without node_modules (a junction to the real one), .env (passed in the environment instead) or .git
function Copy-Snapshot($dest) {
  Step "Copying the working tree to $dest"
  $link = Join-Path $dest 'node_modules'
  if (Test-Path $link) { cmd /c rmdir "$link" }   # removes only the junction, never what it points to
  robocopy $Repo $dest /MIR /XD node_modules dist .git e2e\out /XF .env /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }
  New-Item -ItemType Junction -Path $link -Target (Join-Path $Repo 'node_modules') | Out-Null
}

try {
  $dotenv = Read-DotEnv (Join-Path $Repo '.env')
  if (-not $dotenv['DATABASE_URL']) { throw '.env has no DATABASE_URL' }

  Step 'Prerequisites'
  Start-Postgres
  $dns = Start-Tailscale

  if ($Mode -eq 'prod') {
    $dir = $Repo; $port = 5000; $servePort = 443; $name = 'prod'
    $dbUrl = $dotenv['DATABASE_URL']
  } else {
    $dir = Join-Path $env:USERPROFILE 'sw5e-test'; $port = 5002; $servePort = 10000; $name = 'test'
    $dbUrl = $dotenv['DATABASE_URL'] -replace '/sw5e(\?.*)?$', '/sw5e_test$1'
    if ($dbUrl -eq $dotenv['DATABASE_URL']) { throw 'could not point DATABASE_URL at sw5e_test' }
  }

  # Every setting from .env goes to the server; the port and database of this mode win
  foreach ($key in $dotenv.Keys) { Set-Item -Path "env:$key" -Value $dotenv[$key] }
  $env:DATABASE_URL = $dbUrl
  $env:PORT = "$port"
  $env:NODE_ENV = 'production'

  Step "Stopping the $name server if it runs"
  Stop-GameServer $port

  if ($Mode -eq 'test') { Copy-Snapshot $dir }

  if (-not (Test-Path (Join-Path $dir 'node_modules'))) {
    Step 'Installing packages'
    Push-Location $dir; try { Invoke-Checked 'npm' @('install') } finally { Pop-Location }
  }

  Step 'Building'
  if ($Mode -eq 'test') { $env:VITE_TEST_MENU = '1' } else { Remove-Item Env:VITE_TEST_MENU -ErrorAction SilentlyContinue }
  Push-Location $dir; try { Invoke-Checked 'npm' @('run', 'build') } finally { Pop-Location }
  Remove-Item Env:VITE_TEST_MENU -ErrorAction SilentlyContinue

  Step 'Database migrations'
  Push-Location $dir; try { Invoke-Checked 'npx' @('drizzle-kit', 'migrate') } finally { Pop-Location }

  Step "Starting the $name server"
  Start-GameServer $dir $port $name

  Step 'Tailscale Serve'
  Invoke-Checked 'tailscale' @('serve', '--bg', "--https=$servePort", "http://127.0.0.1:$port")
  $url = if ($servePort -eq 443) { "https://$dns" } else { "https://${dns}:$servePort" }

  Step 'Opening the browser'
  Write-Host "The $name server is at $url (this PC: http://127.0.0.1:$port/)"
  Start-Process $url
} catch {
  Write-Host "`nFAILED: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
