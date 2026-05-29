param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$TauriArgs
)

$ErrorActionPreference = 'Stop'

if ($TauriArgs.Count -gt 0 -and $TauriArgs[0] -eq 'dev') {
  & "$PSScriptRoot\kill-dev.ps1"
}

& pnpm exec tauri @TauriArgs
exit $LASTEXITCODE
