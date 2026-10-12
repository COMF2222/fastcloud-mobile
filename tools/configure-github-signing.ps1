$ErrorActionPreference = 'Stop'
if (!(Get-Command gh -ErrorAction SilentlyContinue)) { throw 'Install GitHub CLI and run gh auth login first.' }
$taskConfigPath = Join-Path $env:LOCALAPPDATA 'Fastcloud\mobile-signing\signing.json'
$taskConfig = Get-Content -LiteralPath $taskConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$taskPassword = [System.Net.NetworkCredential]::new('', (ConvertTo-SecureString $taskConfig.password)).Password
$taskValues = @{FASTCLOUD_ANDROID_KEYSTORE_BASE64=[Convert]::ToBase64String([IO.File]::ReadAllBytes($taskConfig.storeFile));FASTCLOUD_ANDROID_STORE_PASSWORD=$taskPassword;FASTCLOUD_ANDROID_KEY_ALIAS=$taskConfig.alias;FASTCLOUD_ANDROID_KEY_PASSWORD=$taskPassword}
# Owner-run publication step: upload only to the explicit mobile repository.
foreach ($taskEntry in $taskValues.GetEnumerator()) {
    $taskStart = [Diagnostics.ProcessStartInfo]::new((Get-Command gh).Source, "secret set $($taskEntry.Key) --repo COMF2222/fastcloud-mobile")
    $taskStart.UseShellExecute = $false
    $taskStart.CreateNoWindow = $true
    $taskStart.RedirectStandardInput = $true
    $taskProcess = [Diagnostics.Process]::Start($taskStart)
    $taskProcess.StandardInput.Write($taskEntry.Value)
    $taskProcess.StandardInput.Close()
    $taskProcess.WaitForExit()
    if ($taskProcess.ExitCode -ne 0) { throw "Could not configure secret $($taskEntry.Key)" }
}
$taskPassword = $null
Write-Host 'Android signing secrets configured in COMF2222/fastcloud-mobile.'
