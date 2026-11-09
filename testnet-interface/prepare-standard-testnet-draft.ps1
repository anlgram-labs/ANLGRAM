#Requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$OutputDirectory)

$ErrorActionPreference = 'Stop'
$directory = [IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($directory) | Out-Null
$draftPath = Join-Path $directory 'standard-testnet-draft.json'
$manifestPath = Join-Path $directory 'standard-testnet-manifest.json'
if ((Test-Path -LiteralPath $draftPath) -or (Test-Path -LiteralPath $manifestPath)) {
    throw 'An output file already exists. Use a new folder or reuse the existing draft.'
}

$settings = @{
    name = Read-Host 'Token name'
    symbol = Read-Host 'Token symbol'
    supply = Read-Host 'Total supply in whole tokens or decimal form (use a dot)'
    decimals = Read-Host 'Token decimals'
}
$csvPath = Read-Host 'Public distribution CSV path (press Enter to skip)'
if ($csvPath) {
    $settings.distribution = @{
        csv = Get-Content -LiteralPath $csvPath -Raw -Encoding UTF8
        batchSize = Read-Host 'Recipients per batch (1 to 4)'
    }
}
$beneficiary = Read-Host 'Vesting beneficiary Testnet address (press Enter to skip)'
if ($beneficiary) {
    $settings.vesting = @{
        beneficiary = $beneficiary
        amount = Read-Host 'Vesting token amount'
        startDate = Read-Host 'Vesting UTC start date (YYYY-MM-DD)'
        cliffMonths = Read-Host 'Cliff months (1, 3 or 6)'
        durationMonths = Read-Host 'Duration months (6, 12 or 24)'
    }
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
$cli = Join-Path $PSScriptRoot 'testnet-release-cli.mjs'
$temporary = [IO.Path]::GetTempFileName()
$originalEncoding = [Console]::OutputEncoding
try {
    [Console]::OutputEncoding = $utf8
    [IO.File]::WriteAllText($temporary, ($settings | ConvertTo-Json -Depth 4), $utf8)
    $draft = & node $cli standard-draft $temporary
    if ($LASTEXITCODE -ne 0) { throw 'Draft rejected. Review the public token settings.' }
    [IO.File]::WriteAllText($temporary, ($draft -join "`n"), $utf8)
    $manifest = & node $cli owner-manifest $temporary
    if ($LASTEXITCODE -ne 0) { throw 'Manifest derivation failed.' }
    foreach ($entry in @(@{path=$draftPath; lines=$draft}, @{path=$manifestPath; lines=$manifest})) {
        $stream = [IO.File]::Open($entry.path, [IO.FileMode]::CreateNew)
        try {
            $bytes = $utf8.GetBytes(($entry.lines -join "`n") + "`n")
            $stream.Write($bytes, 0, $bytes.Length)
        } finally { $stream.Dispose() }
    }
} finally {
    [Console]::OutputEncoding = $originalEncoding
    [IO.File]::Delete($temporary)
}
Write-Output $draftPath, $manifestPath
