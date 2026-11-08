# Starts a game server on this Windows PC with everything it needs, then opens the default browser.
#   prod  the game the user plays: port 5000, database sw5e, tailnet HTTPS on port 443 (built from the working tree).
#   test  a snapshot of the working tree for trying changes: port 5002, database sw5e_test (no showcase world),
#         built with the test menu, tailnet HTTPS on port 10000. The snapshot lives in %USERPROFILE%\sw5e-test.
# Starts Tailscale and PostgreSQL if they are stopped, installs packages if missing, stops any server on ports 5000, 5001 and 5002,
# builds, applies migrations, starts the server hidden (it keeps running when the window closes), sets up Tailscale Serve.
# Reached from this PC and over Tailscale Serve only (the user, 2026-11-08: Tailscale only). The game has no login, so the server listens on
# loopback unless -Lan is given: then HOST=0.0.0.0 and the Windows Firewall is opened for its port to the local subnet only (co-op with friends
# on the same Wi-Fi by the join code; use it only on a network you trust).
# Logs: %LOCALAPPDATA%\sw5e\logs. Usage: powershell -ExecutionPolicy Bypass -File deploy\windows-start.ps1 -Mode prod|test 
param([Parameter(Mandatory = $true)][ValidateSet('prod', 'test')][string]$Mode, [switch]$Lan)

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

# Stops whatever listens on the game's ports (5000 prod, 5001, 5002 test), a built server or a dev one (npm run dev, tsx), with the
# processes it started; so either shortcut leaves the three ports free for the server it starts.
$GamePorts = 5000, 5001, 5002
function Stop-GameServers {
  $stopped = $false
  foreach ($port in $GamePorts) {
    $pids = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($id in $pids) {
      if ($id -eq 0 -or $id -eq 4) { continue }   # System / System Idle: nothing of ours
      $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $id"
      Write-Host "Stopping $($proc.Name) on port $port (pid $id)"
      # /T takes its child processes too (a tsx dev server runs under npm and node wrappers)
      & taskkill /PID $id /T /F | Out-Null
      $stopped = $true
    }
  }
  if ($stopped) { Start-Sleep -Seconds 1 }
  foreach ($port in $GamePorts) {
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { throw "Port $port is still in use after stopping its server" }
  }
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
  if ($Lan) { $env:HOST = '0.0.0.0' } else { Remove-Item Env:HOST -ErrorAction SilentlyContinue }

  Step 'Stopping any server on ports 5000, 5001 and 5002'
  Stop-GameServers

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
  if ($Lan) {
    # Windows Firewall: allow the port from the local subnet only, on any network profile (home Wi-Fi is often labelled Public); needs an administrator window, the rule is made once
    $rule = "SW5e game port $port"
    if (-not (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue)) {
      try { New-NetFirewallRule -DisplayName $rule -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Any -RemoteAddress LocalSubnet -ErrorAction Stop | Out-Null; Write-Host "Firewall: opened port $port to the local subnet" }
      catch { Write-Host "Firewall: could not open port $port (run this script from an administrator window once, or add an inbound TCP rule for it, local subnet only)" -ForegroundColor Yellow }
    }
    $addresses = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.InterfaceAlias -notmatch 'Tailscale|Loopback|vEthernet' } | ForEach-Object { $_.IPAddress }
    foreach ($a in $addresses) { Write-Host "Friends on your Wi-Fi open  http://${a}:${port}/coop  and type the code from the Co-op button in Play" -ForegroundColor Green }
  }
  Start-Process $url
} catch {
  Write-Host "`nFAILED: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
