<#
.SYNOPSIS
    Copies the local airports/airlines/routes data up to the EC2 database.

.DESCRIPTION
    Dumps the local Postgres, ships it over SSH, and restores it on the box,
    replacing whatever is there. Run it after re-scraping and re-importing
    locally; ordinary code deploys go through the GitHub "Deploy to EC2"
    workflow and do not touch data.

    The schema travels with the dump, including the alembic_version row, so the
    remote database lands on the same migration the local one is on.

.EXAMPLE
    .\scripts\push-data.ps1 -RemoteHost 13.50.245.84

.NOTES
    The instance has no Elastic IP, so its public address changes whenever it is
    stopped and started. Pass -RemoteHost when that happens.
#>
[CmdletBinding()]
param(
    [string]$RemoteHost = "13.50.245.84",
    [string]$KeyPath = "$HOME\.ssh\fc_deploy",
    [string]$RemoteUser = "ubuntu",
    [string]$RemoteDir = "flight_companion",
    [string]$DbUser = "flight",
    [string]$DbName = "flight_companion",
    # Skips the "this replaces the live data" confirmation.
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$dumpPath = Join-Path $env:TEMP "flight_companion_dump.sql"
$sshTarget = "${RemoteUser}@${RemoteHost}"
$sshArgs = @("-i", $KeyPath, "-o", "IdentitiesOnly=yes")

if (-not (Test-Path $KeyPath)) {
    throw "SSH key not found at $KeyPath. Pass -KeyPath with the right path."
}

Push-Location $projectRoot
try {
    Write-Host "==> Dumping local database" -ForegroundColor Cyan
    docker compose up -d db
    docker compose exec -T db pg_dump -U $DbUser -d $DbName --no-owner --no-acl -f /tmp/dump.sql
    if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }

    if (Test-Path $dumpPath) { Remove-Item $dumpPath }
    docker compose cp "db:/tmp/dump.sql" $dumpPath
    if ($LASTEXITCODE -ne 0) { throw "could not copy the dump out of the container" }

    # Guard against shipping an empty dump: without this, a local database that
    # failed to import would happily wipe the remote one and restore nothing.
    $size = (Get-Item $dumpPath).Length
    if ($size -lt 500KB) {
        throw "Dump is only $([math]::Round($size / 1KB)) KB, which means the local database is empty or partial. Aborting before anything remote is touched."
    }
    if (-not (Select-String -Path $dumpPath -Pattern "^COPY public\.routes" -Quiet)) {
        throw "Dump contains no routes data. Aborting."
    }
    Write-Host "    $([math]::Round($size / 1MB, 1)) MB, routes present" -ForegroundColor DarkGray

    if (-not $Force) {
        Write-Host ""
        Write-Host "This REPLACES all airport, airline and route data on $RemoteHost." -ForegroundColor Yellow
        if ((Read-Host "Type 'yes' to continue") -ne "yes") {
            Write-Host "Aborted." -ForegroundColor Yellow
            return
        }
    }

    Write-Host "==> Uploading to $sshTarget" -ForegroundColor Cyan
    scp @sshArgs $dumpPath "${sshTarget}:~/dump.sql"
    if ($LASTEXITCODE -ne 0) { throw "scp failed" }

    Write-Host "==> Restoring on the remote database" -ForegroundColor Cyan
    # Piped to "bash -s" rather than passed as an argument, so nothing has to
    # survive PowerShell quoting on its way into the remote shell.
    $remoteScript = @"
set -euo pipefail
cd $RemoteDir

docker compose -f compose.prod.yaml exec -T db \
  psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1 \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

docker compose -f compose.prod.yaml cp ~/dump.sql db:/tmp/dump.sql
docker compose -f compose.prod.yaml exec -T db \
  psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -q -f /tmp/dump.sql

docker compose -f compose.prod.yaml exec -T db \
  psql -U $DbUser -d $DbName -c \
  "SELECT (SELECT count(*) FROM airports) AS airports, (SELECT count(*) FROM airlines) AS airlines, (SELECT count(*) FROM routes) AS routes;"

docker compose -f compose.prod.yaml restart backend
rm -f ~/dump.sql
"@

    $remoteScript | ssh @sshArgs $sshTarget "bash -s"
    if ($LASTEXITCODE -ne 0) { throw "remote restore failed" }

    Write-Host ""
    Write-Host "Done. Checking the API..." -ForegroundColor Cyan
    Start-Sleep -Seconds 3
    try {
        $body = (Invoke-WebRequest -Uri "https://flightcompanion.miguelrodrigues.dev/api/airports" -UseBasicParsing).Content
        Write-Host "    $($body.Substring(0, [Math]::Min(100, $body.Length)))" -ForegroundColor DarkGray
    }
    catch {
        Write-Host "    Could not reach the API: $_" -ForegroundColor Yellow
    }
}
finally {
    Pop-Location
    if (Test-Path $dumpPath) { Remove-Item $dumpPath -ErrorAction SilentlyContinue }
}
