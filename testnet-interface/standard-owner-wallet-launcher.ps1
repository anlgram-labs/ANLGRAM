# standard-owner-wallet-launcher.ps1
# Safe, owner-operated local PowerShell launcher for TON Testnet V5R1 wallet initialization.
# Loads provider credentials into process environment without displaying, printing, or logging them.
[CmdletBinding()]
param(
    [ValidateSet('menu', 'prepare-init', 'sign-init', 'broadcast', 'reconcile', 'inspect-wallet', 'store-credentials')]
    [string]$Action = 'menu',
    [string]$PublicInputPath = 'C:\Private\ANLGRAM\public-init-input.json',
    [string]$QuoteOutputPath = 'C:\Private\ANLGRAM\init-quote.json',
    [string]$BackupGpgPath = 'C:\Private\ANLGRAM\standard-v2-testnet.gpg',
    [string]$SignedOutputPath = 'C:\Private\ANLGRAM\signed-init.json',
    [string]$CredentialPath = (Join-Path $env:USERPROFILE '.codex\credentials\testnet-providers.dpapi')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-FileNoBom([string]$path, $content) {
    $folder = Split-Path -Parent $path
    if ($folder -and -not (Test-Path -LiteralPath $folder)) {
        New-Item -ItemType Directory -Path $folder -Force | Out-Null
    }
    $text = if ($content -is [array]) { $content -join "`n" } else { [string]$content }
    [System.IO.File]::WriteAllText($path, $text, [System.Text.UTF8Encoding]::new($false))
}

function Ensure-ProviderCredentials {
    $hasCenter = [bool]($env:TONCENTER_TESTNET_API_KEY -and $env:TONCENTER_TESTNET_API_KEY.Trim())
    $hasTonapi = [bool]($env:TONAPI_TESTNET_API_KEY -and $env:TONAPI_TESTNET_API_KEY.Trim())

    if ($hasCenter -and $hasTonapi) {
        Write-Host "Authenticated Testnet provider credentials detected in current process environment." -ForegroundColor Green
        return
    }

    if (Test-Path -LiteralPath $CredentialPath) {
        try {
            $raw = Get-Content -Raw -LiteralPath $CredentialPath
            $secure = $raw.Trim() | ConvertTo-SecureString
            $plain = [System.Net.NetworkCredential]::new('', $secure).Password
            $parts = $plain -split '\|\|'
            if ($parts.Length -ge 2 -and $parts[0].Trim() -and $parts[1].Trim()) {
                $env:TONCENTER_TESTNET_API_KEY = $parts[0].Trim()
                $env:TONAPI_TESTNET_API_KEY = $parts[1].Trim()
                Write-Host "Loaded provider credentials from user DPAPI storage ($CredentialPath)." -ForegroundColor Green
                $plain = $null
                return
            }
        } catch {
            Write-Warning "Failed to decrypt local DPAPI credentials: $_"
        }
    }

    Write-Host "`nTestnet provider credentials required for on-chain preflight and proof corroboration." -ForegroundColor Yellow
    Write-Host "Input is masked and will not be displayed, printed, or recorded in logs.`n"

    if (-not $env:TONCENTER_TESTNET_API_KEY) {
        $secCenter = Read-Host -Prompt "Enter TONCENTER_TESTNET_API_KEY (input hidden)" -AsSecureString
        $env:TONCENTER_TESTNET_API_KEY = [System.Net.NetworkCredential]::new('', $secCenter).Password
    }

    if (-not $env:TONAPI_TESTNET_API_KEY) {
        $secTonapi = Read-Host -Prompt "Enter TONAPI_TESTNET_API_KEY (input hidden)" -AsSecureString
        $env:TONAPI_TESTNET_API_KEY = [System.Net.NetworkCredential]::new('', $secTonapi).Password
    }

    if (-not ($env:TONCENTER_TESTNET_API_KEY -and $env:TONCENTER_TESTNET_API_KEY.Trim()) -or -not ($env:TONAPI_TESTNET_API_KEY -and $env:TONAPI_TESTNET_API_KEY.Trim())) {
        throw "Both TONCENTER_TESTNET_API_KEY and TONAPI_TESTNET_API_KEY must be provided."
    }

    $saveChoice = Read-Host "Save encrypted credentials to local DPAPI file for this Windows user? [y/N]"
    if ($saveChoice -eq 'y' -or $saveChoice -eq 'Y') {
        Save-ProviderCredentials
    }
}

function Save-ProviderCredentials {
    $combo = "$($env:TONCENTER_TESTNET_API_KEY)||$($env:TONAPI_TESTNET_API_KEY)"
    $encrypted = ConvertTo-SecureString $combo -AsPlainText -Force | ConvertFrom-SecureString
    Write-FileNoBom $CredentialPath $encrypted
    Write-Host "Credentials encrypted via Windows DPAPI and stored at: $CredentialPath" -ForegroundColor Green
    $combo = $null
    $encrypted = $null
}

function Invoke-InspectWallet {
    Write-Host "`n=== Querying Current On-Chain State ===" -ForegroundColor Cyan
    $cli = Join-Path $PSScriptRoot "standard-preflight-cli.mjs"
    & node $cli --inspect-wallet "0QCetQK2VyBLL2cB9Gmw7fyHudAMwCX75-Mps0NWmk5fCAUn"
}

function Invoke-PrepareInit {
    Ensure-ProviderCredentials
    Write-Host "`n=== Generating Fresh Authenticated Unsigned Quote ===" -ForegroundColor Cyan
    if (-not (Test-Path -LiteralPath $PublicInputPath)) {
        throw "Public input file not found: $PublicInputPath"
    }
    $cli = Join-Path $PSScriptRoot "standard-owner-signer-cli.mjs"
    $quoteJson = & node $cli prepare-init $PublicInputPath
    if ($LASTEXITCODE -ne 0) {
        throw "prepare-init failed with exit code $LASTEXITCODE. See stderr diagnostic above."
    }
    Write-FileNoBom $QuoteOutputPath $quoteJson
    Write-Host "Fresh quote saved to: $QuoteOutputPath" -ForegroundColor Green
    Write-Host "Quote verification: valid for 300 seconds (5 minutes) from generation." -ForegroundColor Yellow
}

function Invoke-SignInit {
    Ensure-ProviderCredentials
    Write-Host "`n=== Interactive Owner Signing Workflow ===" -ForegroundColor Cyan
    Write-Host "Requires local GnuPG Pinentry and exact quote fingerprint confirmation." -ForegroundColor Yellow
    if (-not (Test-Path -LiteralPath $QuoteOutputPath)) {
        throw "Quote file not found: $QuoteOutputPath. Run prepare-init first."
    }
    if (-not (Test-Path -LiteralPath $BackupGpgPath)) {
        throw "Encrypted backup file not found: $BackupGpgPath"
    }
    $cli = Join-Path $PSScriptRoot "standard-owner-signer-cli.mjs"
    $signedJson = & node $cli sign-init $QuoteOutputPath $BackupGpgPath
    if ($LASTEXITCODE -ne 0) {
        throw "sign-init stopped or failed with exit code $LASTEXITCODE."
    }
    Write-FileNoBom $SignedOutputPath $signedJson
    Write-Host "Signed envelope saved to: $SignedOutputPath" -ForegroundColor Green
}

function Invoke-Broadcast {
    Ensure-ProviderCredentials
    Write-Host "`n=== Interactive Owner Broadcast Workflow ===" -ForegroundColor Cyan
    Write-Host "Requires exact message hash confirmation before single Testnet broadcast." -ForegroundColor Yellow
    if (-not (Test-Path -LiteralPath $QuoteOutputPath)) {
        throw "Quote file not found: $QuoteOutputPath"
    }
    if (-not (Test-Path -LiteralPath $SignedOutputPath)) {
        throw "Signed envelope not found: $SignedOutputPath"
    }
    $cli = Join-Path $PSScriptRoot "standard-wallet-broadcast-cli.mjs"
    & node $cli broadcast $QuoteOutputPath $SignedOutputPath
    if ($LASTEXITCODE -ne 0) {
        throw "broadcast stopped or failed with exit code $LASTEXITCODE."
    }
}

function Invoke-Reconcile {
    Ensure-ProviderCredentials
    Write-Host "`n=== Reconciling On-Chain Wallet Initialization ===" -ForegroundColor Cyan
    if (-not (Test-Path -LiteralPath $QuoteOutputPath)) {
        throw "Quote file not found: $QuoteOutputPath"
    }
    if (-not (Test-Path -LiteralPath $SignedOutputPath)) {
        throw "Signed envelope not found: $SignedOutputPath"
    }
    $cli = Join-Path $PSScriptRoot "standard-wallet-broadcast-cli.mjs"
    & node $cli reconcile $QuoteOutputPath $SignedOutputPath
}

switch ($Action) {
    'inspect-wallet'   { Invoke-InspectWallet }
    'prepare-init'     { Invoke-PrepareInit }
    'sign-init'        { Invoke-SignInit }
    'broadcast'        { Invoke-Broadcast }
    'reconcile'        { Invoke-Reconcile }
    'store-credentials'{ Ensure-ProviderCredentials; Save-ProviderCredentials }
    'menu' {
        Write-Host "==========================================================" -ForegroundColor Cyan
        Write-Host " ANLGRAM TESTNET V5R1 WALLET INITIALIZATION LAUNCHER" -ForegroundColor Cyan
        Write-Host " Destination: 0QCetQK2VyBLL2cB9Gmw7fyHudAMwCX75-Mps0NWmk5fCAUn" -ForegroundColor Cyan
        Write-Host "==========================================================" -ForegroundColor Cyan
        Write-Host "1. inspect-wallet    - Query current Testnet on-chain status"
        Write-Host "2. prepare-init      - Generate fresh authenticated unsigned quote"
        Write-Host "3. sign-init         - Owner signing via Pinentry (single attempt)"
        Write-Host "4. broadcast         - Confirm & broadcast to Testnet"
        Write-Host "5. reconcile         - Check on-chain result from transaction proof"
        Write-Host "6. store-credentials - Encrypt & persist provider keys via DPAPI"
        Write-Host "Q. Quit"
        $choice = Read-Host "`nSelect an option [1-6, Q]"
        switch ($choice) {
            '1' { Invoke-InspectWallet }
            '2' { Invoke-PrepareInit }
            '3' { Invoke-SignInit }
            '4' { Invoke-Broadcast }
            '5' { Invoke-Reconcile }
            '6' { Ensure-ProviderCredentials; Save-ProviderCredentials }
            default { Write-Host "Exiting." }
        }
    }
}

