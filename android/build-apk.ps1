param([switch]$Install)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent

# Use Android Studio's bundled JDK when this terminal has no JAVA_HOME.
if (-not $env:JAVA_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    $bundledJdk = Join-Path $env:ProgramFiles 'Android\Android Studio\jbr'
    if (-not (Test-Path -LiteralPath (Join-Path $bundledJdk 'bin\java.exe'))) {
        throw 'Android Studio JDK를 찾을 수 없습니다. JAVA_HOME에 JDK 경로를 설정해 주세요.'
    }
    $env:JAVA_HOME = $bundledJdk
}
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
Write-Host "Using JDK $env:JAVA_HOME"

Push-Location $projectRoot
try {
    & node 'node_modules/typescript/bin/tsc' --noEmit
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript 검사에 실패했습니다.' }
    & "$PSScriptRoot\gradlew.bat" -p $PSScriptRoot :app:assembleDebug --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'APK 빌드에 실패했습니다.' }
    $apk = Join-Path $PSScriptRoot 'app\build\outputs\apk\debug\app-debug.apk'
    Write-Host "APK $apk"
    if ($Install) {
        $sdk = $env:ANDROID_HOME
        if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
        $adb = Join-Path $sdk 'platform-tools\adb.exe'
        if (-not (Test-Path -LiteralPath $adb)) { throw 'Android SDK의 adb를 찾을 수 없습니다.' }
        & $adb install -r $apk
        if ($LASTEXITCODE -ne 0) { throw 'APK 설치에 실패했습니다.' }
        $androidUser = (& $adb shell am get-current-user).Trim()
        if ($LASTEXITCODE -ne 0) { throw '에뮬레이터 사용자를 확인하지 못했습니다.' }
        & $adb shell am start --user $androidUser -n com.aim.gazee/.MainActivity
        if ($LASTEXITCODE -ne 0) { throw '앱 실행에 실패했습니다.' }
    }
} finally {
    Pop-Location
}
