$ErrorActionPreference = "Stop"

$backupDir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { "backups" }
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

$timestamp = [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss")
$backupFile = Join-Path $backupDir "nodedr-pos-$timestamp.dump"
$tempFile = "$backupFile.partial"

$envValues = @{}
if (Test-Path ".env") {
  foreach ($line in Get-Content ".env") {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      $envValues[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
    }
  }
}

$postgresHost = if ($envValues.POSTGRES_HOST) { $envValues.POSTGRES_HOST } else { "postgres" }
$postgresPort = if ($envValues.POSTGRES_PORT) { $envValues.POSTGRES_PORT } else { "5432" }
$postgresDb = if ($envValues.POSTGRES_DB) { $envValues.POSTGRES_DB } else { "nodedrpos" }
$postgresUser = if ($envValues.POSTGRES_USER) { $envValues.POSTGRES_USER } else { "nodedr" }
$postgresNetwork = if ($envValues.POSTGRES_NETWORK) { $envValues.POSTGRES_NETWORK } else { "nodedr-pos-postgres" }
$postgresPassword = $envValues.POSTGRES_PASSWORD
if (-not $postgresPassword) {
  throw "POSTGRES_PASSWORD is missing from .env."
}

$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = "docker"
$startInfo.Arguments = "run --rm --network `"$postgresNetwork`" -e PGPASSWORD postgres:18-alpine pg_dump -h `"$postgresHost`" -p `"$postgresPort`" -U `"$postgresUser`" -d `"$postgresDb`" --format=custom"
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true

$process = New-Object System.Diagnostics.Process
$process.StartInfo = $startInfo
$outputStream = $null
$previousPassword = $env:PGPASSWORD

try {
  $env:PGPASSWORD = $postgresPassword
  if (-not $process.Start()) {
    throw "Could not start Docker to create the database backup."
  }

  $errorTask = $process.StandardError.ReadToEndAsync()
  $outputStream = [System.IO.File]::Create($tempFile)
  $process.StandardOutput.BaseStream.CopyTo($outputStream)
  $outputStream.Dispose()
  $outputStream = $null
  $process.WaitForExit()
  $errorOutput = $errorTask.GetAwaiter().GetResult()

  if ($process.ExitCode -ne 0) {
    throw "Database backup failed: $errorOutput"
  }

  Move-Item -LiteralPath $tempFile -Destination $backupFile
  Write-Output "Backup created: $backupFile"
}
catch {
  if ($outputStream) {
    $outputStream.Dispose()
  }
  Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue
  throw
}
finally {
  if ($null -eq $previousPassword) {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  }
  else {
    $env:PGPASSWORD = $previousPassword
  }
  $process.Dispose()
}
