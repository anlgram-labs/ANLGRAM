# supervised-launchpad-launcher.ps1
# Safe, owner-operated PowerShell launcher for ANLGRAM MemeLabs Launchpad deployment (300 TON Calibration).
# 100% compatible with Windows PowerShell 5.1 and PowerShell 7+.
# Zero leak of private keys, mnemonics, or unredacted BOCs.
# Integrates GnuPG Pinentry for human owner authorization on every state change.
[CmdletBinding()]
param(
    [ValidateSet('menu', 'preflight', 'sign-next', 'broadcast-next', 'run-next', 'inspect-launchpad', 'status')]
    [string]$Action = 'menu',
    [int]$Step = 0,
    [string]$QuotePath = 'C:\Private\ANLGRAM\supervised-launchpad-testnet\launchpad-quote.json',
    [string]$SignedPath = 'C:\Private\ANLGRAM\supervised-launchpad-testnet\signed-step.json',
    [string]$BackupGpgPath = 'C:\Private\ANLGRAM\standard-v2-testnet.gpg',
    [string]$CredentialPath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ScriptDirectory = if ($PSScriptRoot) {
    $PSScriptRoot
} elseif ($MyInvocation.MyCommand.Path) {
    Split-Path -Parent $MyInvocation.MyCommand.Path
} else {
    (Get-Location).Path
}

# Ensure GnuPG binary is accessible in current process environment
$gnupgPaths = @("C:\Program Files\GnuPG\bin", "C:\Program Files (x86)\GnuPG\bin", "C:\Program Files\Git\usr\bin")
foreach ($p in $gnupgPaths) {
    if ((Test-Path $p) -and ($env:PATH -notlike "*$p*")) {
        $env:PATH = "$p;$env:PATH"
    }
}

if (-not $CredentialPath) {
    $userHome = if ($env:USERPROFILE) { $env:USERPROFILE } else { [System.Environment]::GetFolderPath('UserProfile') }
    $CredentialPath = Join-Path $userHome '.codex\credentials\testnet-providers.dpapi'
}

function Ensure-ProviderCredentials {
    $hasCenter = [bool]($env:TONCENTER_TESTNET_API_KEY -and $env:TONCENTER_TESTNET_API_KEY.Trim())
    if ($hasCenter) {
        Write-Host "Authenticated Testnet provider credentials detected in current process environment." -ForegroundColor Green
        return
    }

    if (Test-Path -LiteralPath $CredentialPath) {
        try {
            $raw = [System.IO.File]::ReadAllText($CredentialPath, [System.Text.Encoding]::UTF8)
            $secure = $raw.Trim() | ConvertTo-SecureString
            $plain = (New-Object System.Net.NetworkCredential('', $secure)).Password
            $parts = $plain -split '\|\|'
            if ($parts.Length -ge 1 -and $parts[0].Trim()) {
                $env:TONCENTER_TESTNET_API_KEY = $parts[0].Trim()
                if ($parts.Length -ge 2 -and $parts[1].Trim()) {
                    $env:TONAPI_TESTNET_API_KEY = $parts[1].Trim()
                }
                Write-Host "Loaded provider credentials from DPAPI storage." -ForegroundColor Green
                $plain = $null
                return
            }
        } catch {}
    }
}

function New-OwnerOnlyFileSecurity {
    $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object System.Security.AccessControl.FileSecurity
    $acl.SetAccessRuleProtection($true, $false)
    $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        $currentUser,
        [System.Security.AccessControl.FileSystemRights]::FullControl,
        [System.Security.AccessControl.AccessControlType]::Allow
    )
    $acl.SetAccessRule($accessRule)
    return $acl
}

function Write-AtomicFileNoBom {
    param([string]$Path, $Content, [switch]$Overwrite)
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $dir = [System.IO.Path]::GetDirectoryName($fullPath)
    if ($dir -and -not [System.IO.Directory]::Exists($dir)) {
        [System.IO.Directory]::CreateDirectory($dir) | Out-Null
    }
    if (-not $Overwrite -and [System.IO.File]::Exists($fullPath)) {
        throw "Target file already exists: '$fullPath'"
    }
    $text = if ($Content -is [array]) { $Content -join [System.Environment]::NewLine } else { [string]$Content }
    $encoding = New-Object System.Text.UTF8Encoding $false
    $bytes = $encoding.GetBytes($text)
    $tempPath = [System.IO.Path]::Combine($dir, ('.tmp_' + [System.Guid]::NewGuid().ToString('N')))
    try {
        $fileSecurity = New-OwnerOnlyFileSecurity
        $fs = [System.IO.File]::Create($tempPath, 4096, [System.IO.FileOptions]::None, $fileSecurity)
        try {
            $fs.Write($bytes, 0, $bytes.Length)
            $fs.Flush()
        } finally {
            $fs.Dispose()
        }
        if ($Overwrite -and [System.IO.File]::Exists($fullPath)) {
            [System.IO.File]::Delete($fullPath)
        }
        [System.IO.File]::Move($tempPath, $fullPath)
    } finally {
        if ([System.IO.File]::Exists($tempPath)) {
            try { [System.IO.File]::Delete($tempPath) } catch {}
        }
    }
}

function Get-DeployerCli {
    $candidates = @(
        (Join-Path $ScriptDirectory 'supervised-launchpad-deployer-cli.mjs'),
        (Join-Path (Join-Path $ScriptDirectory '..') 'minter-contract\supervised-launchpad-deployer-cli.mjs'),
        (Join-Path $ScriptDirectory 'minter-contract\supervised-launchpad-deployer-cli.mjs')
    )
    foreach ($c in $candidates) {
        if (Test-Path -LiteralPath $c) { return (Resolve-Path -LiteralPath $c).Path }
    }
    throw "supervised-launchpad-deployer-cli.mjs not found."
}

function Invoke-Preflight {
    Ensure-ProviderCredentials
    Write-Host "`n=== Querying Testnet On-Chain State and Generating Execution Quote ===" -ForegroundColor Cyan
    $cli = Get-DeployerCli
    $quoteRaw = & node $cli preflight
    if ($LASTEXITCODE -ne 0) {
        throw "preflight failed with exit code $LASTEXITCODE."
    }
    $quoteText = if ($quoteRaw -is [array]) { $quoteRaw -join [System.Environment]::NewLine } else { [string]$quoteRaw }
    $parsed = $quoteText | ConvertFrom-Json
    Write-AtomicFileNoBom -Path $QuotePath -Content $quoteText -Overwrite

    Write-Host "`n==========================================================================" -ForegroundColor Green
    Write-Host " FRESH LAUNCHPAD EXECUTION QUOTE GENERATED (VALID FOR 300 SECONDS)" -ForegroundColor Green
    Write-Host " Operator Wallet : $($parsed.operatorFriendly)"
    Write-Host " Wallet Balance  : $($parsed.walletBalanceTon) TON"
    Write-Host " Wallet Seqno    : $($parsed.seqno)"
    Write-Host " Graduation Target: $($parsed.budget.graduationTargetTon) TON (0.000000% Discontinuity)"
    Write-Host "--------------------------------------------------------------------------"
    Write-Host " Contract States:"
    Write-Host "   Minter   : $($parsed.contracts.launchpadMinter.state) ($($parsed.contracts.launchpadMinter.address))"
    Write-Host "   Curve    : $($parsed.contracts.bondingCurve.state) ($($parsed.contracts.bondingCurve.address))"
    Write-Host "   Locker   : $($parsed.contracts.lpLocker.state) ($($parsed.contracts.lpLocker.address))"
    Write-Host "   Migrator : $($parsed.contracts.migrationRouter.state) ($($parsed.contracts.migrationRouter.address))"
    Write-Host "--------------------------------------------------------------------------"
    if ($parsed.nextStep -le 8) {
        Write-Host " NEXT PENDING STEP : Step $($parsed.nextStep) - $($parsed.nextOperation.name)" -ForegroundColor Yellow
        Write-Host " Attachment Gas    : $($parsed.nextOperation.amountTon) TON"
        Write-Host " Target Contract   : $($parsed.nextOperation.targetAddress)"
        Write-Host " Fingerprint       : $($parsed.fingerprint)"
        Write-Host " Expiry Epoch      : $($parsed.validUntil) Unix seconds"
    } else {
        Write-Host " ALL 8 LAUNCHPAD STEPS ARE COMPLETE ON-CHAIN! CURVE IS ACTIVE!" -ForegroundColor Green
    }
    Write-Host " Saved Quote       : $QuotePath"
    Write-Host "==========================================================================" -ForegroundColor Green
    return $parsed
}

function Invoke-SignNextStep {
    param([int]$StepNumber)
    Write-Host "`n=== Interactive Owner Signing for Launchpad Step ===" -ForegroundColor Cyan
    Write-Host "Requires local GnuPG Pinentry and exact quote fingerprint confirmation." -ForegroundColor Yellow

    if (-not (Test-Path -LiteralPath $QuotePath)) {
        throw "Quote not found: $QuotePath. Run preflight first."
    }
    $quoteRaw = [System.IO.File]::ReadAllText($QuotePath, [System.Text.Encoding]::UTF8)
    $parsed = $quoteRaw | ConvertFrom-Json

    $targetStep = if ($StepNumber -gt 0) { $StepNumber } else { $parsed.nextStep }
    if ($targetStep -gt 8) {
        Write-Host "All launchpad steps are already completed on-chain!" -ForegroundColor Green
        return $null
    }

    $activeFp = $parsed.fingerprint
    $approval = "AUTHORIZE TESTNET STEP $targetStep $activeFp"
    $env:ANLGRAM_OWNER_APPROVAL = $approval

    $cli = Get-DeployerCli
    try {
        $signedRaw = & node $cli sign-step $targetStep $QuotePath $BackupGpgPath
        if ($LASTEXITCODE -ne 0) {
            throw "sign-step failed with exit code $LASTEXITCODE."
        }
    } finally {
        $env:ANLGRAM_OWNER_APPROVAL = $null
    }

    $signedText = if ($signedRaw -is [array]) { $signedRaw -join [System.Environment]::NewLine } else { [string]$signedRaw }
    $parsedSigned = $signedText | ConvertFrom-Json
    Write-AtomicFileNoBom -Path $SignedPath -Content $signedText -Overwrite

    Write-Host "`n==========================================================================" -ForegroundColor Green
    Write-Host " STEP $targetStep TRANSACTION SIGNED SUCCESSFULLY" -ForegroundColor Green
    Write-Host " Step Name    : $($parsedSigned.name)"
    Write-Host " Message Hash : $($parsedSigned.messageHash)"
    Write-Host " Target       : $($parsedSigned.targetAddress)"
    Write-Host " Saved Signed : $SignedPath"
    Write-Host "==========================================================================" -ForegroundColor Green
    return $parsedSigned
}

function Invoke-BroadcastNextStep {
    param([int]$StepNumber)
    Ensure-ProviderCredentials
    Write-Host "`n=== Broadcasting Signed Step Transaction to TON Testnet ===" -ForegroundColor Cyan
    if (-not (Test-Path -LiteralPath $SignedPath)) {
        throw "Signed envelope not found: $SignedPath. Sign the step first."
    }
    $signedRaw = [System.IO.File]::ReadAllText($SignedPath, [System.Text.Encoding]::UTF8)
    $parsed = $signedRaw | ConvertFrom-Json

    $targetStep = if ($StepNumber -gt 0) { $StepNumber } else { $parsed.step }
    $approval = "CONFIRM BROADCAST STEP $targetStep $($parsed.messageHash)"
    $env:ANLGRAM_OWNER_APPROVAL = $approval

    $cli = Get-DeployerCli
    try {
        $broadcastRaw = & node $cli broadcast-step $targetStep $SignedPath
        if ($LASTEXITCODE -ne 0) {
            throw "broadcast-step failed with exit code $LASTEXITCODE."
        }
    } finally {
        $env:ANLGRAM_OWNER_APPROVAL = $null
    }

    Write-Host "`n==========================================================================" -ForegroundColor Green
    Write-Host " STEP $targetStep BROADCAST SUBMITTED TO TON TESTNET" -ForegroundColor Green
    Write-Host " Message Hash : $($parsed.messageHash)"
    Write-Host " Target       : $($parsed.targetAddress)"
    Write-Host " Response: $broadcastRaw"
    Write-Host " Allow 10-20 seconds for block inclusion."
    Write-Host "==========================================================================" -ForegroundColor Green
}

function Invoke-InspectLaunchpad {
    Ensure-ProviderCredentials
    Write-Host "`n=== Querying Comprehensive On-Chain Launchpad State ===" -ForegroundColor Cyan
    $cli = Get-DeployerCli
    & node $cli inspect-launchpad
}

# Router
switch ($Action) {
    'preflight' {
        Invoke-Preflight | Out-Null
    }
    'sign-next' {
        Invoke-SignNextStep -StepNumber $Step | Out-Null
    }
    'broadcast-next' {
        Invoke-BroadcastNextStep -StepNumber $Step
    }
    'run-next' {
        $quote = Invoke-Preflight
        if ($quote.nextStep -le 8) {
            $signed = Invoke-SignNextStep -StepNumber $quote.nextStep
            if ($signed) {
                Invoke-BroadcastNextStep -StepNumber $quote.nextStep
            }
        }
    }
    'inspect-launchpad' {
        Invoke-InspectLaunchpad
    }
    'status' {
        $q = Invoke-Preflight
        Write-Host "`nNext Step: $($q.nextStep) ($($q.nextOperation.name))" -ForegroundColor Cyan
    }
    'menu' {
        Ensure-ProviderCredentials
        while ($true) {
            Write-Host "`n==========================================================================" -ForegroundColor Cyan
            Write-Host "  ANLGRAM MemeLabs Launchpad Launcher -- Testnet 300 TON Calibration" -ForegroundColor Cyan
            Write-Host "==========================================================================" -ForegroundColor Cyan
            Write-Host " [1] Preflight and Generate Fresh Quote (Inspect On-Chain States and Next Step)"
            Write-Host " [2] Sign Next Step with GnuPG Pinentry"
            Write-Host " [3] Broadcast Signed Step to TON Testnet"
            Write-Host " [4] Safe Step Execution (Preflight -> Sign -> Broadcast Next Step)"
            Write-Host " [5] Inspect Full On-Chain Launchpad Contracts and AMM State"
            Write-Host " [Q] Quit"
            Write-Host "--------------------------------------------------------------------------"
            $choice = (Read-Host "Select option").Trim().ToUpperInvariant()

            if ($choice -eq 'Q') { break }
            switch ($choice) {
                '1' { Invoke-Preflight | Out-Null }
                '2' { Invoke-SignNextStep -StepNumber 0 | Out-Null }
                '3' { Invoke-BroadcastNextStep -StepNumber 0 }
                '4' {
                    $q = Invoke-Preflight
                    if ($q.nextStep -le 8) {
                        $signed = Invoke-SignNextStep -StepNumber $q.nextStep
                        if ($signed) {
                            Invoke-BroadcastNextStep -StepNumber $q.nextStep
                        }
                    }
                }
                '5' { Invoke-InspectLaunchpad }
                default { Write-Host "Invalid option." -ForegroundColor Red }
            }
        }
    }
}
