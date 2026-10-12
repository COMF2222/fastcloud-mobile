$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$taskConfigPath = Join-Path $env:LOCALAPPDATA 'Fastcloud\mobile-signing\signing.json'
if (!(Test-Path -LiteralPath $taskConfigPath)) { '{}' | Write-Output; exit 0 }
$taskConfig = Get-Content -LiteralPath $taskConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$taskSecret = ConvertTo-SecureString $taskConfig.password
$taskPassword = [System.Net.NetworkCredential]::new('', $taskSecret).Password
# Only the build helper captures this process pipe. Never print it in build logs.
@{FASTCLOUD_ANDROID_KEYSTORE=$taskConfig.storeFile;FASTCLOUD_ANDROID_STORE_PASSWORD=$taskPassword;FASTCLOUD_ANDROID_KEY_ALIAS=$taskConfig.alias;FASTCLOUD_ANDROID_KEY_PASSWORD=$taskPassword} | ConvertTo-Json -Compress
