# Backs up the game's database (characters, campaigns, debriefs) to %USERPROFILE%\sw5e-backups, keeping the newest 14 dumps (T-001).
#   powershell -ExecutionPolicy Bypass -File deploy\windows-backup.ps1            dump now
#   powershell -ExecutionPolicy Bypass -File deploy\windows-backup.ps1 -Verify    dump, restore it into sw5e_test (replacing its contents), compare row counts
# Reads DATABASE_URL from .env (never printed). To run it every night at 03:00 (once, from a normal window):
#   schtasks /Create /TN "SW5e backup" /SC DAILY /ST 03:00 /TR "powershell -ExecutionPolicy Bypass -File C:\Users\Admin\Desktop\SW5E\SW5e-Proper\deploy\windows-backup.ps1"
# To restore: pg_restore --clean --if-exists -d <database url> <dump file>
param([switch]$Verify, [string]$Dir = (Join-Path $env:USERPROFILE 'sw5e-backups'), [int]$Keep = 14)
$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot
$Bin = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1 | ForEach-Object { $_.DirectoryName }
if (-not $Bin) { throw 'pg_dump not found under C:\Program Files\PostgreSQL' }

$url = $null
foreach ($line in Get-Content (Join-Path $Repo '.env')) {
  if ($line -match '^\s*DATABASE_URL\s*=\s*(.*?)\s*$') { $url = $matches[1].Trim('"', "'") }
}
if (-not $url) { throw 'DATABASE_URL is not in .env' }

New-Item -ItemType Directory -Force -Path $Dir | Out-Null
$out = Join-Path $Dir ("sw5e-{0}.dump" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
& "$Bin\pg_dump.exe" -Fc -f $out $url
if ($LASTEXITCODE -ne 0) { Remove-Item $out -ErrorAction SilentlyContinue; throw "pg_dump failed with exit code $LASTEXITCODE" }
Get-ChildItem (Join-Path $Dir 'sw5e-*.dump') | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep | Remove-Item
Write-Host ("backup written: {0} ({1:N0} KB)" -f $out, ((Get-Item $out).Length / 1KB))

if ($Verify) {
  # restores into sw5e_test (a scratch copy: its contents are replaced) and compares row counts with the live database
  $scratch = $url -replace '/sw5e(\?.*)?$', '/sw5e_test$1'
  if ($scratch -eq $url) { throw 'could not point DATABASE_URL at sw5e_test' }
  $tables = 'characters', 'campaigns', 'debriefs'
  function Count($u) { $r = @{}; foreach ($t in $tables) { $r[$t] = [int](& "$Bin\psql.exe" -d $u -t -A -c "select count(*) from $t") }; $r }
  & "$Bin\pg_restore.exe" --clean --if-exists --no-owner -d $scratch $out
  if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with exit code $LASTEXITCODE" }
  $a = Count $url; $b = Count $scratch
  $bad = $false
  foreach ($t in $tables) {
    Write-Host ("{0}: live {1}, restored {2}" -f $t, $a[$t], $b[$t])
    if ($a[$t] -ne $b[$t]) { $bad = $true }
  }
  if ($bad) { throw 'row counts differ' }
  Write-Host 'restore check passed'
}
