param(
 [switch]$Initialize,
 [string]$GrantPath,
 [string]$CredentialPath = (Join-Path $env:USERPROFILE '.codex\credentials\anlgram-testnet-curve-admin.dpapi')
)
$ErrorActionPreference = 'Stop'
# Administrative HTTP credential only; never a TON private key or seed.
if ($Initialize) {
 if (Test-Path -LiteralPath $CredentialPath) { throw 'Credential already exists; rotation requires explicit review.' }
 $bytes = New-Object byte[] 32
 [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
 $secret = [Convert]::ToHexString($bytes).ToLowerInvariant()
 $folder = Split-Path -Parent $CredentialPath
 New-Item -ItemType Directory -Path $folder -Force | Out-Null
 ConvertTo-SecureString $secret -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $CredentialPath
 # DPAPI encryption binds this credential to the current Windows user.
 $secret | & npx.cmd wrangler pages secret put CURVE_TX2_RUNTIME_AUTH_KEY --project-name anlgram-testnet-preparation
 if ($LASTEXITCODE -ne 0) { throw 'Secret upload failed. Preserve the encrypted credential and investigate; do not regenerate.' }
 Write-Output 'Administrative key configured. Deploy Pages once to activate the binding. No runtime grant was created.'
} else {
 if (!$GrantPath) { throw 'An explicitly reviewed finite grant file is required. No automatic authorization or renewal.' }
 $secure = (Get-Content -Raw -LiteralPath $CredentialPath).Trim() | ConvertTo-SecureString
 $secret = [System.Net.NetworkCredential]::new('', $secure).Password
 $secret | & node "$PSScriptRoot/runtime-authorization-admin.mjs" $GrantPath
 if ($LASTEXITCODE -ne 0) { throw 'Runtime authorization failed. No signing request was made; do not retry automatically.' }
}
$secret = $null
