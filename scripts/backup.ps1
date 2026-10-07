$ErrorActionPreference = "Stop"

$backupDir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { "backups" }
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

$timestamp = [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss")
$backupFile = Join-Path $backupDir "nodedr-pos-$timestamp.dump"
$tempFile = "$backupFile.partial"

$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = "docker"
$startInfo.Arguments = "compose exec -T db pg_dump -U nodedr -d nodedrpos --format=custom"
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true

$process = New-Object System.Diagnostics.Process
$process.StartInfo = $startInfo
$outputStream = $null

try {
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
  $process.Dispose()
}
