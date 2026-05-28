param(
    [ValidateSet("all", "fe", "be")]
    [string]$Mode = "all"
)

$ErrorActionPreference = "Stop"

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,

        [string[]]$Arguments = @()
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

function Invoke-FrontendTests {
    Invoke-CheckedCommand "pnpm" @("format:check")
    Invoke-CheckedCommand "pnpm" @("build")
}

function Invoke-BackendTests {
    Push-Location src-tauri
    try {
        Invoke-CheckedCommand "cargo" @("clippy", "--", "-D", "warnings")
        Invoke-CheckedCommand "cargo" @("test")
    }
    finally {
        Pop-Location
    }
}

switch ($Mode) {
    "all" {
        Invoke-FrontendTests
        Invoke-BackendTests
    }
    "fe" {
        Invoke-FrontendTests
    }
    "be" {
        Invoke-BackendTests
    }
}
