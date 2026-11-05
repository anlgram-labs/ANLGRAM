#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
if (-not [Environment]::UserInteractive) { exit 2 }
$quote = $env:ANLGRAM_INIT_DIALOG_DETAILS | ConvertFrom-Json
if ($quote.network -cne '-3' -or $quote.fingerprint -cnotmatch '^[a-f0-9]{64}$') { exit 2 }
$expected = 'AUTHORIZE TESTNET INIT ' + $quote.fingerprint
$expiry = [long]$quote.validUntil
if ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() -ge $expiry) { exit 3 }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object Windows.Forms.Form
$form.Text = 'ANLGRAM | Owner confirmation | TESTNET ONLY'
$form.StartPosition = 'CenterScreen'
$form.ClientSize = New-Object Drawing.Size(720, 300)
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.TopMost = $true

$details = New-Object Windows.Forms.TextBox
$details.SetBounds(16, 16, 688, 153)
$details.Multiline = $true
$details.ReadOnly = $true
$details.Font = New-Object Drawing.Font('Consolas', 9)
$details.Lines = @('Operation: sign wallet initialization only. No broadcast.',
    "Network: TON Testnet (-3)", "Wallet: $($quote.address)", "Fingerprint: $($quote.fingerprint)",
    "Modeled fee: $($quote.modeledFeeNano) nanotons. Policy ceiling: $($quote.policyCeilingNano) nanotons.",
    'Enter the exact line below in this window, not in PowerShell:',
    $expected)

$entry = New-Object Windows.Forms.TextBox
$entry.SetBounds(16, 184, 688, 25)
$entry.Font = $details.Font
$status = New-Object Windows.Forms.Label
$status.SetBounds(16, 221, 688, 23)
$approve = New-Object Windows.Forms.Button
$approve.Text = 'Confirm signing'
$approve.SetBounds(435, 253, 132, 32)
$approve.Enabled = $false
$cancel = New-Object Windows.Forms.Button
$cancel.Text = 'Cancel'
$cancel.SetBounds(580, 253, 124, 32)
$cancel.DialogResult = [Windows.Forms.DialogResult]::Cancel
$form.CancelButton = $cancel
$form.Controls.AddRange(@($details,$entry,$status,$approve,$cancel))

$update = {
    $seconds = $expiry - [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    if ($seconds -le 0) {
        $form.DialogResult = [Windows.Forms.DialogResult]::Abort
        $form.Close()
        return
    }
    $approve.Enabled = $entry.Text -ceq $expected
    $state = if ($approve.Enabled) { 'Exact authorization entered.' } else { 'Type the full line or copy it from the box above.' }
    $status.Text = "$state  Quote expires in $seconds seconds."
}
$entry.Add_TextChanged($update)
$approve.Add_Click({
    if ($entry.Text -ceq $expected -and [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() -lt $expiry) {
        $form.DialogResult = [Windows.Forms.DialogResult]::OK
        $form.Close()
    }
})
$timer = New-Object Windows.Forms.Timer
$timer.Interval = 1000
$timer.Add_Tick($update)
$form.Add_Shown({ [void]$entry.Focus(); & $update; $timer.Start() })
try {
    $result = $form.ShowDialog()
    if ($result -eq [Windows.Forms.DialogResult]::Abort) { exit 3 }
    if ($result -ne [Windows.Forms.DialogResult]::OK) { exit 2 }
    [Console]::WriteLine($entry.Text)
} finally {
    $timer.Dispose()
    $form.Dispose()
}
