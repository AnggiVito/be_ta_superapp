#Requires -Version 5.1
<#
.SYNOPSIS
  Menjalankan pg_dump schema-only untuk tabel Registration yang dipakai Conduct.

.DESCRIPTION
  Baca variabel dari .env di root be_practicum (jika ada).
  Jika REGISTRATION_DB_HOST = registration_db (nama service Docker), otomatis pakai
  localhost + REGISTRATION_HOST_PORT (default 5433) agar pg_dump dari host Windows berhasil.

  Output default: registration_schema.sql di root folder be_practicum.

  Prasyarat: Docker stack jalan (container fri-registration-db) ATAU Postgres registration_db
  dapat diakses dari host dengan kredensial di .env.

.EXAMPLE
  cd be_practicum
  .\scripts\dump-registration-schema.ps1
#>

$ErrorActionPreference = "Stop"
# scripts/ -> root repo be_practicum
$RepoRoot = Split-Path $PSScriptRoot -Parent

$envFile = Join-Path $RepoRoot ".env"
if (-not (Test-Path $envFile)) {
  $envFile = Join-Path $RepoRoot ".env.dev"
}

function Import-DotEnv {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return }
  Get-Content $Path | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      $key = $matches[1].Trim()
      $val = $matches[2].Trim().Trim('"').Trim("'")
      Set-Item -Path "Env:$key" -Value $val
    }
  }
}

Import-DotEnv $envFile

$pgDump = "pg_dump"
if (Test-Path "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe") {
  $pgDump = "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"
}

$dbHost = $env:REGISTRATION_DB_HOST
if ([string]::IsNullOrWhiteSpace($dbHost)) { $dbHost = "localhost" }

$dbPort = $env:REGISTRATION_DB_PORT
if ([string]::IsNullOrWhiteSpace($dbPort)) { $dbPort = "5432" }

# Dari host Windows, service name "registration_db" tidak resolve — pakai port publish Docker.
# docker-compose.yml default host port 5433; docker-compose.dev.yml default 5438 — set REGISTRATION_HOST_PORT di .env / .env.dev.
if ($dbHost -eq "registration_db" -or $dbHost -eq "fri-registration-db" -or $dbHost -eq "fri-registration-db-dev") {
  $dbHost = "127.0.0.1"
  $hostPort = $env:REGISTRATION_HOST_PORT
  if ([string]::IsNullOrWhiteSpace($hostPort)) { $hostPort = "5433" }
  $dbPort = $hostPort
}

$dbUser = $env:REGISTRATION_DB_USER
if ([string]::IsNullOrWhiteSpace($dbUser)) { $dbUser = "postgres" }

$dbName = $env:REGISTRATION_DB_NAME
if ([string]::IsNullOrWhiteSpace($dbName)) { $dbName = "registration_db" }

$dbPass = $env:REGISTRATION_DB_PASSWORD
if (-not [string]::IsNullOrWhiteSpace($dbPass)) {
  $env:PGPASSWORD = $dbPass
}

$outFile = Join-Path $RepoRoot "registration_schema.sql"

$tables = @(
  "study_programs",
  "laboratories",
  "practicums",
  "practicum_modules",
  "schedules",
  "schedule_assistants",
  "schedule_slots",
  "schedule_bookings"
)

$tableArgs = $tables | ForEach-Object { "-t", $_ }
# Gunakan -f agar exit code pg_dump terbaca benar (pipeline ke Set-Content mengaburkan kegagalan).
$args = @(
  "-h", $dbHost,
  "-p", $dbPort,
  "-U", $dbUser,
  "-d", $dbName,
  "--schema-only",
  "--no-owner",
  "--no-acl"
) + $tableArgs + @("-f", $outFile)

Write-Host "pg_dump -> $outFile"
Write-Host "  host=$dbHost port=$dbPort user=$dbUser db=$dbName"

& $pgDump @args
$exit = $LASTEXITCODE
if ($exit -ne 0) {
  Remove-Item -LiteralPath $outFile -ErrorAction SilentlyContinue
  Write-Host ""
  Write-Host "pg_dump GAGAL (exit $exit). Penyebab umum:" -ForegroundColor Yellow
  Write-Host "  - Tidak ada server Postgres di ${dbHost}:$dbPort (Docker/stack belum jalan)." -ForegroundColor Yellow
  Write-Host "  - Jalankan dari folder be_practicum, misalnya:" -ForegroundColor Yellow
  Write-Host "      docker compose up -d registration_db" -ForegroundColor Cyan
  Write-Host "  - Kalau pakai Postgres lokal (bukan Docker), set di .env:" -ForegroundColor Yellow
  Write-Host "      REGISTRATION_DB_HOST=127.0.0.1  dan  REGISTRATION_DB_PORT=<port yang benar>" -ForegroundColor Cyan
  exit $exit
}

Write-Host "Selesai. Ukuran file:" (Get-Item -LiteralPath $outFile).Length "bytes"
