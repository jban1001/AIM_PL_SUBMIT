param(
    [ValidateSet('front', 'rear')]
    [string]$Role
)

$ErrorActionPreference = 'Stop'
$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$adb = Join-Path $sdk 'platform-tools\adb.exe'

function Select-DemoVehicle([string]$targetRole) {
    if (-not (Test-Path -LiteralPath $adb)) {
        throw 'Android SDK에서 adb를 찾을 수 없어요.'
    }

    $androidUser = (& $adb -e shell am get-current-user | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $androidUser -notmatch '^\d+$') {
        throw 'Pleos 에뮬레이터 하나를 연결한 뒤 다시 시도해 주세요.'
    }

    $arguments = @('-e', 'shell', 'am', 'broadcast', '--user', $androidUser,
        '-a', 'com.aim.gazee.DEMO_ROLE', '-p', 'com.aim.gazee', '--es', 'role', $targetRole)
    $result = (& $adb @arguments | Out-String)
    if ($LASTEXITCODE -eq 0 -and $result -match 'Broadcast completed: result=-1') {
        if ($targetRole -eq 'rear') { return '뒤차 선택 완료 · 전환 후 약 15초 뒤 제보 카드가 표시돼요.' }
        return '앞차 선택 완료'
    }
    if ($result -match 'report-required') { throw '앞차에서 먼저 제보를 등록해 주세요.' }
    throw 'Pleos 에뮬레이터에서 GAZEE 커뮤니티 화면을 열어 주세요.'
}

if ($Role) {
    Select-DemoVehicle $Role
    exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$window = New-Object System.Windows.Forms.Form
$window.Text = 'GAZEE 시연 조작'
$window.ClientSize = New-Object System.Drawing.Size(390, 148)
$window.FormBorderStyle = 'FixedDialog'
$window.MaximizeBox = $false
$window.StartPosition = 'CenterScreen'

$hint = New-Object System.Windows.Forms.Label
$hint.Text = 'Pleos 에뮬레이터의 시연 차량을 선택하세요.'
$hint.Location = New-Object System.Drawing.Point(16, 15)
$hint.Size = New-Object System.Drawing.Size(358, 24)
$window.Controls.Add($hint)

$front = New-Object System.Windows.Forms.Button
$front.Text = '앞차 · 제보 차량'
$front.Location = New-Object System.Drawing.Point(16, 44)
$front.Size = New-Object System.Drawing.Size(172, 38)
$window.Controls.Add($front)

$rear = New-Object System.Windows.Forms.Button
$rear.Text = '뒤차 · 수신 차량'
$rear.Location = New-Object System.Drawing.Point(202, 44)
$rear.Size = New-Object System.Drawing.Size(172, 38)
$window.Controls.Add($rear)

$status = New-Object System.Windows.Forms.Label
$status.Location = New-Object System.Drawing.Point(16, 95)
$status.Size = New-Object System.Drawing.Size(358, 38)
$window.Controls.Add($status)

$front.Add_Click({
    try { $status.Text = Select-DemoVehicle 'front' }
    catch { $status.Text = $_.Exception.Message }
})
$rear.Add_Click({
    try { $status.Text = Select-DemoVehicle 'rear' }
    catch { $status.Text = $_.Exception.Message }
})

try { [void]$window.ShowDialog() }
finally { $window.Dispose() }


