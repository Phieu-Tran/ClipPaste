$ErrorActionPreference = 'SilentlyContinue'

$repoRoot = Split-Path -Parent $PSScriptRoot
$debugExe = Join-Path $repoRoot 'src-tauri\target\debug\clippaste.exe'
$stopped = New-Object System.Collections.Generic.HashSet[int]

Get-Process clippaste -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -eq $debugExe } |
  ForEach-Object {
    if ($stopped.Add($_.Id)) {
      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
      Write-Host "Stopped clippaste dev process $($_.Id)"
    }
  }

Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object {
    $ownerPid = [int]$_
    if ($ownerPid -gt 0 -and $stopped.Add($ownerPid)) {
      Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
      Write-Host "Stopped dev server process $ownerPid on port 1420"
    }
  }

exit 0
