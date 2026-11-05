# standard-owner-wallet-launcher.ps1
# Safe, owner-operated local PowerShell launcher for TON Testnet V5R1 wallet initialization.
# 100% compatible with Windows PowerShell 5.1.
# Loads provider credentials into process environment without displaying, printing, or logging them.
# Enforces atomic, no-overwrite UTF-8 without BOM writes and fail-closed owner-only NTFS ACLs.
# Guaranteed zero leak of signed envelope, BOC, decrypted material, or credentials in logs or console.
[CmdletBinding()]
param(
    [ValidateSet('menu', 'prepare-init', 'sign-init', 'prepare-and-sign-init', 'test-confirmation', 'broadcast', 'reconcile', 'inspect-wallet', 'store-credentials')]
    [string]$Action = 'menu',
    [string]$PublicInputPath = 'C:\Private\ANLGRAM\public-init-input.json',
    [string]$QuoteOutputPath = 'C:\Private\ANLGRAM\init-quote.json',
    [string]$BackupGpgPath = 'C:\Private\ANLGRAM\standard-v2-testnet.gpg',
    [string]$SignedOutputPath = 'C:\Private\ANLGRAM\signed-init.json',
    [string]$CredentialPath = '',
    [int]$MinQuoteValiditySeconds = 10
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Reviewed, pinned Testnet V5R1 destination
$PINNED_WALLET_ADDRESS = '0QCetQK2VyBLL2cB9Gmw7fyHudAMwCX75-Mps0NWmk5fCAUn'
$PINNED_OPERATOR = '0:9eb502b657204b2f6701f469b0edfc87b9d00cc025fbe7e329b343569a4e5f08'

# Script directory resolution compatible across all PowerShell 5.1 invocation styles
$ScriptDirectory = if ($PSScriptRoot) {
    $PSScriptRoot
} elseif ($MyInvocation.MyCommand.Path) {
    Split-Path -Parent $MyInvocation.MyCommand.Path
} else {
    (Get-Location).Path
}

# Resolve default DPAPI credential path if not explicitly provided
if (-not $CredentialPath) {
    $userHome = if ($env:USERPROFILE) { $env:USERPROFILE } else { [System.Environment]::GetFolderPath('UserProfile') }
    $CredentialPath = Join-Path $userHome '.codex\credentials\testnet-providers.dpapi'
}

function New-OwnerOnlyFileSecurity {
    try {
        $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
        if (-not $currentUser) {
            throw "Unable to determine current Windows user security identifier (SID)."
        }
        $acl = New-Object System.Security.AccessControl.FileSecurity
        # Disable inheritance and remove inherited rules (fail-closed)
        $acl.SetAccessRuleProtection($true, $false)
        $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
            $currentUser,
            [System.Security.AccessControl.FileSystemRights]::FullControl,
            [System.Security.AccessControl.AccessControlType]::Allow
        )
        $acl.SetAccessRule($accessRule)
        return $acl
    } catch {
        throw "Failed to construct owner-only FileSecurity descriptor: $_"
    }
}

function Set-OwnerOnlyAcl([string]$filePath) {
    try {
        $acl = New-OwnerOnlyFileSecurity
        $fileInfo = New-Object System.IO.FileInfo($filePath)
        $fileInfo.SetAccessControl($acl)

        # Verification check: fail closed if rules are not protected or empty
        $appliedAcl = $fileInfo.GetAccessControl()
        if (-not $appliedAcl.AreAccessRulesProtected) {
            throw "Access rules on '$filePath' are not protected from inheritance."
        }
        if ($appliedAcl.Access.Count -eq 0) {
            throw "Zero access rules found on '$filePath'."
        }
    } catch {
        throw "Owner-only ACL enforcement failed closed on '$filePath': $_"
    }
}

function Write-AtomicFileNoBom {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        $Content,
        [switch]$OwnerOnly,
        [switch]$Overwrite
    )

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $dir = [System.IO.Path]::GetDirectoryName($fullPath)
    if ($dir -and -not [System.IO.Directory]::Exists($dir)) {
        try {
            [System.IO.Directory]::CreateDirectory($dir) | Out-Null
        } catch {
            throw "Target directory cannot be created at '$dir': $_"
        }
    }

    if (-not $Overwrite -and [System.IO.File]::Exists($fullPath)) {
        throw "Target file already exists and Overwrite is not permitted: '$fullPath'"
    }

    $text = if ($Content -is [array]) { $Content -join [System.Environment]::NewLine } else { [string]$Content }
    $encoding = New-Object System.Text.UTF8Encoding $false
    $bytes = $encoding.GetBytes($text)

    $guidStr = [System.Guid]::NewGuid().ToString("N")
    $tempPath = [System.IO.Path]::Combine($dir, ('.tmp_' + $guidStr))
    try {
        if ($OwnerOnly) {
            $fileSecurity = New-OwnerOnlyFileSecurity
            # Create the temp file with protected owner-only ACL at kernel creation time
            $fs = [System.IO.File]::Create($tempPath, 4096, [System.IO.FileOptions]::None, $fileSecurity)
            try {
                $fs.Write($bytes, 0, $bytes.Length)
                $fs.Flush()
            } finally {
                $fs.Dispose()
            }
            # Verify ACL on temp file before placement
            Set-OwnerOnlyAcl -filePath $tempPath
        } else {
            [System.IO.File]::WriteAllBytes($tempPath, $bytes)
        }

        if ($Overwrite -and [System.IO.File]::Exists($fullPath)) {
            $backupPath = [System.IO.Path]::Combine($dir, ('.bak_' + $guidStr))
            try {
                [System.IO.File]::Replace($tempPath, $fullPath, $backupPath)
                if ([System.IO.File]::Exists($backupPath)) {
                    [System.IO.File]::Delete($backupPath)
                }
            } catch {
                if ([System.IO.File]::Exists($backupPath)) {
                    [System.IO.File]::Delete($backupPath)
                }
                throw
            }
        } else {
            # Move provides atomic O_EXCL semantics (throws IOException if destination exists)
            [System.IO.File]::Move($tempPath, $fullPath)
        }
    } finally {
        if ([System.IO.File]::Exists($tempPath)) {
            try { [System.IO.File]::Delete($tempPath) } catch {}
        }
    }
}

function Test-OutputTargetWritable([string]$path) {
    $fullPath = [System.IO.Path]::GetFullPath($path)
    if ([System.IO.File]::Exists($fullPath)) {
        throw "Target output file already exists: '$fullPath'. Refusing to overwrite existing file."
    }
    $dir = [System.IO.Path]::GetDirectoryName($fullPath)
    if ($dir -and -not [System.IO.Directory]::Exists($dir)) {
        try {
            [System.IO.Directory]::CreateDirectory($dir) | Out-Null
        } catch {
            throw "Target output path is not writable or directory cannot be created ('$dir'): $_"
        }
    }

    $probePath = [System.IO.Path]::Combine($dir, ('.probe_' + [System.Guid]::NewGuid().ToString("N")))
    try {
        $testBytes = [System.Text.Encoding]::UTF8.GetBytes("PROBE")
        $fileSecurity = New-OwnerOnlyFileSecurity
        $fs = [System.IO.File]::Create($probePath, 4096, [System.IO.FileOptions]::None, $fileSecurity)
        try {
            $fs.Write($testBytes, 0, $testBytes.Length)
            $fs.Flush()
        } finally {
            $fs.Dispose()
        }

        Set-OwnerOnlyAcl -filePath $probePath
        $readBytes = [System.IO.File]::ReadAllBytes($probePath)
        if ($readBytes.Length -ne $testBytes.Length) {
            throw "Probe readback length mismatch."
        }
    } catch {
        throw "Target output path is not writable or access is denied ('$fullPath'): $_"
    } finally {
        if ([System.IO.File]::Exists($probePath)) {
            try { [System.IO.File]::Delete($probePath) } catch {}
        }
    }
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
            $raw = [System.IO.File]::ReadAllText($CredentialPath, [System.Text.Encoding]::UTF8)
            $secure = $raw.Trim() | ConvertTo-SecureString
            $plain = (New-Object System.Net.NetworkCredential('', $secure)).Password
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
        $env:TONCENTER_TESTNET_API_KEY = (New-Object System.Net.NetworkCredential('', $secCenter)).Password
    }

    if (-not $env:TONAPI_TESTNET_API_KEY) {
        $secTonapi = Read-Host -Prompt "Enter TONAPI_TESTNET_API_KEY (input hidden)" -AsSecureString
        $env:TONAPI_TESTNET_API_KEY = (New-Object System.Net.NetworkCredential('', $secTonapi)).Password
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
    Write-AtomicFileNoBom -Path $CredentialPath -Content $encrypted -OwnerOnly -Overwrite
    Write-Host "Credentials encrypted via Windows DPAPI and stored at: $CredentialPath" -ForegroundColor Green
    $combo = $null
    $encrypted = $null
}

function Invoke-InspectWallet {
    Write-Host "`n=== Querying Current On-Chain State ===" -ForegroundColor Cyan
    $cli = Join-Path $ScriptDirectory "standard-preflight-cli.mjs"
    & node $cli --inspect-wallet $PINNED_WALLET_ADDRESS
}

function Assert-NoInitializationAttempt {
    if (Test-Path -LiteralPath $SignedOutputPath) {
        throw 'Target output file already exists. Refusing to overwrite existing file. Preserve it and reconcile before any further signing.'
    }
    $homePath = & node -p "require('node:os').homedir()"
    if ($LASTEXITCODE -ne 0 -or -not $homePath) { throw 'Cannot locate the signing marker directory.' }
    $prefix = Join-Path (Join-Path $homePath '.anlgram-standard-v2') $PINNED_OPERATOR.Substring(2)
    foreach ($suffix in @('.init-pending','.init-broadcast')) {
        if (Test-Path -LiteralPath ($prefix+$suffix)) {
            throw 'An initialization attempt marker exists. Preserve it and reconcile before any further signing.'
        }
    }
}

function Assert-NativeGnuPG {
    if (Get-Command gpg.exe -ErrorAction SilentlyContinue) { return }
    foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if (-not $base) { continue }
        $bin = Join-Path $base 'GnuPG\bin'
        if (Test-Path -LiteralPath (Join-Path $bin 'gpg.exe')) {
            $env:Path = "$bin;$env:Path"
            return
        }
    }
    throw 'GnuPG was not found. Install GnuPG with a graphical Pinentry before starting owner signing.'
}

function Invoke-PrepareInit {
    Ensure-ProviderCredentials
    Write-Host "`n=== Generating Fresh Authenticated Unsigned Quote ===" -ForegroundColor Cyan
    if (-not (Test-Path -LiteralPath $PublicInputPath)) {
        throw "Public input file not found: $PublicInputPath"
    }

    # If QuoteOutputPath exists and is already expired, safely archive it
    if (Test-Path -LiteralPath $QuoteOutputPath) {
        try {
            $existingRaw = [System.IO.File]::ReadAllText($QuoteOutputPath, [System.Text.Encoding]::UTF8)
            $existingParsed = $existingRaw | ConvertFrom-Json
            $nowUtc = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
            if ($existingParsed.quote.validUntil -and ([int64]$existingParsed.quote.validUntil -le $nowUtc)) {
                $dirPath = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($QuoteOutputPath))
                $archiveName = "init-quote.expired_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".json"
                $archivePath = [System.IO.Path]::Combine($dirPath, $archiveName)
                Move-Item -LiteralPath $QuoteOutputPath -Destination $archivePath -Force
                Write-Host "Archived previous expired quote to: $archivePath" -ForegroundColor DarkGray
            }
        } catch {}
    }

    # Pre-flight check on QuoteOutputPath before doing external RPC work
    Test-OutputTargetWritable -path $QuoteOutputPath

    $cli = Join-Path $ScriptDirectory "standard-owner-signer-cli.mjs"
    $quoteJson = & node $cli prepare-init $PublicInputPath
    if ($LASTEXITCODE -ne 0) {
        throw "prepare-init failed with exit code $LASTEXITCODE. See stderr diagnostic above."
    }

    # Normalize stdout to single string and verify quote JSON integrity
    $quoteText = if ($quoteJson -is [array]) { $quoteJson -join [System.Environment]::NewLine } else { [string]$quoteJson }
    $parsedQuote = $quoteText | ConvertFrom-Json
    if (-not $parsedQuote.quote -or -not $parsedQuote.quote.fingerprint -or -not $parsedQuote.quote.validUntil) {
        throw "Generated quote is missing required fields (quote.fingerprint, quote.validUntil)."
    }

    Write-AtomicFileNoBom -Path $QuoteOutputPath -Content $quoteText -OwnerOnly

    # Re-read verification
    $verifyRaw = [System.IO.File]::ReadAllText($QuoteOutputPath, [System.Text.Encoding]::UTF8)
    $verifyParsed = $verifyRaw | ConvertFrom-Json
    if ($verifyParsed.quote.fingerprint -ne $parsedQuote.quote.fingerprint) {
        throw "Quote disk verification failed: fingerprint mismatch."
    }

    Write-Host ""
    Write-Host "==========================================================================" -ForegroundColor Green
    Write-Host " FRESH INITIALIZATION QUOTE GENERATED (VALID FOR 300 SECONDS)" -ForegroundColor Green
    Write-Host " Destination  : $PINNED_WALLET_ADDRESS" -ForegroundColor Cyan
    Write-Host " Fingerprint  : $($parsedQuote.quote.fingerprint)" -ForegroundColor Yellow
    Write-Host " Expiry Epoch : $($parsedQuote.quote.validUntil) Unix seconds" -ForegroundColor Cyan
    Write-Host " Saved Quote  : $QuoteOutputPath" -ForegroundColor Green
    Write-Host "--------------------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host " Next step: Run sign-init before the quote expires. Authorization is entered in its separate dialog." -ForegroundColor Yellow
    Write-Host "==========================================================================" -ForegroundColor Green
}

function Invoke-SignInit {
    Assert-NoInitializationAttempt
    Assert-NativeGnuPG
    Ensure-ProviderCredentials
    Write-Host "`n=== Interactive Owner Signing Workflow ===" -ForegroundColor Cyan
    Write-Host "Requires local GnuPG Pinentry and exact quote fingerprint confirmation." -ForegroundColor Yellow

    if (-not (Test-Path -LiteralPath $QuoteOutputPath)) {
        throw "Quote file not found: $QuoteOutputPath. Run prepare-init first."
    }
    if (-not (Test-Path -LiteralPath $BackupGpgPath)) {
        throw "Encrypted backup file not found: $BackupGpgPath"
    }

    # Validate Quote JSON & verify it has not expired
    $quoteRaw = [System.IO.File]::ReadAllText($QuoteOutputPath, [System.Text.Encoding]::UTF8)
    $quoteParsed = $quoteRaw | ConvertFrom-Json
    if (-not $quoteParsed.quote -or -not $quoteParsed.quote.fingerprint -or -not $quoteParsed.quote.validUntil) {
        throw "Quote file '$QuoteOutputPath' is missing required fields (quote.fingerprint, quote.validUntil)."
    }

    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $validUntil = [int64]$quoteParsed.quote.validUntil
    $remaining = $validUntil - $now
    if ($remaining -le 0) {
        throw "Quote has already expired ($validUntil <= $now). Refusing to sign with expired quote. Run prepare-init to generate a fresh quote."
    }
    if ($remaining -lt $MinQuoteValiditySeconds) {
        throw "Quote validity remaining ($remaining s) is below safety margin of $MinQuoteValiditySeconds seconds. Refusing to sign. Run prepare-init to generate a fresh quote."
    }

    # Verify quote destination matches pinned wallet
    $targetAddr = if ($quoteParsed.wallet.address) { $quoteParsed.wallet.address } else { $quoteParsed.wallet.operator }
    if ($quoteParsed.wallet.address -ne $PINNED_WALLET_ADDRESS -and $quoteParsed.wallet.operator -ne $PINNED_OPERATOR) {
        throw "Quote target wallet mismatch: expected $PINNED_WALLET_ADDRESS, found $targetAddr."
    }

    # PRE-FLIGHT WRITE PERMISSION & NO-OVERWRITE CHECK (Strictly BEFORE sign-init)
    Test-OutputTargetWritable -path $SignedOutputPath

    Write-Host "Pre-flight checks passed." -ForegroundColor Green
    Write-Host ""
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host " STAGE 3: OWNER SIGNING AUTHORIZATION" -ForegroundColor Cyan
    Write-Host " Target Wallet    : $PINNED_WALLET_ADDRESS" -ForegroundColor Cyan
    Write-Host " Network          : TON Testnet (-3) | Wallet initialization only" -ForegroundColor Cyan
    Write-Host " Quote Fingerprint: $($quoteParsed.quote.fingerprint)" -ForegroundColor Yellow
    Write-Host " Validity Window  : $remaining seconds remaining (expires at $validUntil Unix epoch)" -ForegroundColor Cyan
    Write-Host "--------------------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host " Instructions:" -ForegroundColor Yellow
    Write-Host " 1. In the separate ANLGRAM window, enter the exact line shown and click Confirm signing." -ForegroundColor Yellow
    Write-Host " 2. After approval, enter your backup passphrase only in GnuPG Pinentry." -ForegroundColor Yellow
    Write-Host " This action saves a signed file locally. It does not broadcast." -ForegroundColor Yellow
    Write-Host "==========================================================================" -ForegroundColor Cyan

    $cli = Join-Path $ScriptDirectory "standard-owner-signer-cli.mjs"
    $signedJson = & node $cli sign-init $QuoteOutputPath $BackupGpgPath --windows-dialog
    if ($LASTEXITCODE -ne 0) {
        throw "sign-init stopped or failed with exit code $LASTEXITCODE."
    }

    # Normalize stdout to single string and verify Signed Envelope Integrity
    $signedText = if ($signedJson -is [array]) { $signedJson -join [System.Environment]::NewLine } else { [string]$signedJson }
    $signedParsed = $signedText | ConvertFrom-Json
    if ($signedParsed.status -ne 'SIGNED_NOT_BROADCAST') {
        throw "Signed envelope status is invalid: expected SIGNED_NOT_BROADCAST, got '$($signedParsed.status)'."
    }
    if (-not $signedParsed.boc -or -not $signedParsed.messageHash -or -not $signedParsed.fingerprint) {
        throw "Signed envelope missing required cryptographic fields (boc, messageHash, fingerprint)."
    }
    if ($signedParsed.fingerprint -ne $quoteParsed.quote.fingerprint) {
        throw "Cryptographic fingerprint mismatch: signed envelope fingerprint '$($signedParsed.fingerprint)' does not match quote fingerprint '$($quoteParsed.quote.fingerprint)'."
    }

    $msgHash = $signedParsed.messageHash
    $fgp = $signedParsed.fingerprint

    # Atomic write to $SignedOutputPath with strict fail-closed error handling (never prints raw payload)
    try {
        Write-AtomicFileNoBom -Path $SignedOutputPath -Content $signedText -OwnerOnly

        # Re-read verification
        $verifyRaw = [System.IO.File]::ReadAllText($SignedOutputPath, [System.Text.Encoding]::UTF8)
        $verifyParsed = $verifyRaw | ConvertFrom-Json
        if ($verifyParsed.messageHash -ne $msgHash) {
            throw "On-disk verification failed: message hash mismatch."
        }

        Write-Host "Signed envelope successfully verified and saved to: $SignedOutputPath" -ForegroundColor Green
        Write-Host "Message Hash: $msgHash" -ForegroundColor Green
        Write-Host "Fingerprint : $fgp" -ForegroundColor Green
    } catch {
        throw 'CRITICAL POST-SIGNING FAILURE: Could not save or verify signed envelope. Preserve the .init-pending marker. Do not re-run sign-init or broadcast.'
    } finally {
        # Securely wipe in-memory sensitive variables
        $signedJson = $null
        $signedText = $null
        $signedParsed = $null
        $verifyRaw = $null
        $verifyParsed = $null
    }
}

function Invoke-Broadcast {
    Ensure-ProviderCredentials
    Write-Host "`n=== Interactive Owner Broadcast Workflow ===" -ForegroundColor Cyan
    Write-Host "Requires exact message hash confirmation before single Testnet broadcast." -ForegroundColor Yellow

    if (-not (Test-Path -LiteralPath $QuoteOutputPath)) {
        throw "Quote file not found: $QuoteOutputPath"
    }
    if (-not (Test-Path -LiteralPath $SignedOutputPath)) {
        throw "Signed envelope not found: $SignedOutputPath. Run sign-init first."
    }

    # Validate Quote & Signed Envelope
    $quoteRaw = [System.IO.File]::ReadAllText($QuoteOutputPath, [System.Text.Encoding]::UTF8)
    $quoteParsed = $quoteRaw | ConvertFrom-Json
    $signedRaw = [System.IO.File]::ReadAllText($SignedOutputPath, [System.Text.Encoding]::UTF8)
    $signedParsed = $signedRaw | ConvertFrom-Json

    if ($signedParsed.status -ne 'SIGNED_NOT_BROADCAST') {
        throw "Signed envelope status is not SIGNED_NOT_BROADCAST: $($signedParsed.status)"
    }
    if ($signedParsed.fingerprint -ne $quoteParsed.quote.fingerprint) {
        throw "Fingerprint mismatch: envelope $($signedParsed.fingerprint) != quote $($quoteParsed.quote.fingerprint)"
    }

    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $validUntil = [int64]$quoteParsed.quote.validUntil
    if ($validUntil -le $now) {
        throw "Initialization quote expired at $validUntil (current time: $now). Refusing to broadcast expired transaction."
    }

    $authString = "BROADCAST TESTNET WALLET INIT $($signedParsed.messageHash)"
    try { Set-Clipboard -Value $authString } catch {}

    Write-Host ""
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host " STAGE 4: OWNER BROADCAST AUTHORIZATION" -ForegroundColor Cyan
    Write-Host " Target Wallet    : $PINNED_WALLET_ADDRESS" -ForegroundColor Cyan
    Write-Host " Message Hash     : $($signedParsed.messageHash)" -ForegroundColor Yellow
    Write-Host " Quote Fingerprint: $($signedParsed.fingerprint)" -ForegroundColor Cyan
    Write-Host " Validity Window  : $($validUntil - $now) seconds remaining" -ForegroundColor Cyan
    Write-Host "--------------------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host " Instructions:" -ForegroundColor Yellow
    Write-Host " When the terminal prompts '> ', enter the exact authorization string below:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   $authString" -ForegroundColor White
    Write-Host ""
    Write-Host " (String has been copied to your clipboard; press Ctrl+V or Right-Click)" -ForegroundColor DarkGray
    Write-Host "==========================================================================" -ForegroundColor Cyan

    $cli = Join-Path $ScriptDirectory "standard-wallet-broadcast-cli.mjs"
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
    $cli = Join-Path $ScriptDirectory "standard-wallet-broadcast-cli.mjs"
    & node $cli reconcile $QuoteOutputPath $SignedOutputPath
    if ($LASTEXITCODE -ne 0) {
        throw "reconcile failed with exit code $LASTEXITCODE."
    }
}

switch ($Action) {
    'test-confirmation' {
        & node (Join-Path $ScriptDirectory 'standard-init-dialog-check.mjs')
        exit $LASTEXITCODE
    }
    'inspect-wallet'   { Invoke-InspectWallet }
    'prepare-init'     { Invoke-PrepareInit }
    'sign-init'        { Invoke-SignInit }
    'prepare-and-sign-init' {
        Assert-NoInitializationAttempt
        Assert-NativeGnuPG
        Test-OutputTargetWritable -path $SignedOutputPath
        $reuse = $false
        if (Test-Path -LiteralPath $QuoteOutputPath) {
            $existing = [IO.File]::ReadAllText($QuoteOutputPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
            $reuse = [int64]$existing.quote.validUntil -gt [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        }
        if (-not $reuse) { Invoke-PrepareInit }
        Invoke-SignInit
    }
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
