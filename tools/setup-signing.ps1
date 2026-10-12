$ErrorActionPreference = 'Stop'
$taskSigningDirectory = Join-Path $env:LOCALAPPDATA 'Fastcloud\mobile-signing'
$taskSigningConfig = Join-Path $taskSigningDirectory 'signing.json'
$taskKeystore = Join-Path $taskSigningDirectory 'fastcloud-mobile-release.p12'
if (Test-Path -LiteralPath $taskSigningConfig) {
    if (!(Test-Path -LiteralPath $taskKeystore)) { throw 'Signing metadata exists but its key is missing. Restore the existing key before building updates.' }
    Write-Host 'Existing Android signing key retained.'
    exit 0
}
if (Test-Path -LiteralPath $taskKeystore) { throw 'An existing signing key has no metadata. Restore its password instead of replacing it.' }
New-Item -ItemType Directory -Path $taskSigningDirectory -Force | Out-Null
$taskRuntime = Get-Content (Join-Path $env:LOCALAPPDATA 'Fastcloud\android-toolchain\environment.json') -Raw | ConvertFrom-Json
$taskBytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($taskBytes)
$taskPassword = ([BitConverter]::ToString($taskBytes)).Replace('-', '').ToLowerInvariant()
$taskCipher = ConvertFrom-SecureString (ConvertTo-SecureString $taskPassword -AsPlainText -Force)
$env:FASTCLOUD_KEYTOOL_PASSWORD = $taskPassword
try {
    & (Join-Path $taskRuntime.java 'bin\keytool.exe') -genkeypair -keystore $taskKeystore -storetype PKCS12 -alias fastcloud -keyalg RSA -keysize 4096 -validity 36500 -storepass:env FASTCLOUD_KEYTOOL_PASSWORD -keypass:env FASTCLOUD_KEYTOOL_PASSWORD -dname 'CN=Fastcloud Mobile, OU=Application signing, O=Fastcloud' -noprompt
    if ($LASTEXITCODE -ne 0) { throw 'Android signing key generation failed' }
    @{storeFile=$taskKeystore;alias='fastcloud';password=$taskCipher} | ConvertTo-Json | Set-Content -LiteralPath $taskSigningConfig -Encoding UTF8
} finally {
    Remove-Item Env:\FASTCLOUD_KEYTOOL_PASSWORD -ErrorAction SilentlyContinue
    $taskPassword = $null
}
Write-Host 'Android signing key saved privately. Its password is protected with Windows DPAPI.'
Write-Host 'Retain this key for every mobile release. GitHub signing configuration is a separate owner-run step.'
