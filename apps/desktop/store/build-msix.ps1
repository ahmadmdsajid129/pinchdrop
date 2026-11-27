# Builds the Microsoft Store package (PinchDrop.msix): the app without its own updater (the Store
# updates it), the Store logos and the manifest. Upload the .msix in Partner Center; the Store
# signs it, so Windows shows no "unknown publisher" warning.
#   powershell -ExecutionPolicy Bypass -File apps\desktop\store\build-msix.ps1
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = Split-Path -Parent $here
$id = Get-Content (Join-Path $here 'identity.json') -Raw | ConvertFrom-Json
if (-not $id.name -or -not $id.publisher) { throw 'Fill in store\identity.json from Partner Center first (see docs\launch.md).' }
$conf = Get-Content (Join-Path $desktop 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json
$version = "$($conf.version).0"   # Store versions have 4 parts; the last must be 0

Push-Location $desktop
try {
  # The Store build: no self-updater, no NSIS installer.
  pnpm tauri build --no-bundle --features store
} finally { Pop-Location }

$layout = Join-Path $here 'layout'
if (Test-Path $layout) { Remove-Item -Recurse -Force $layout }
New-Item -ItemType Directory -Force $layout | Out-Null
Copy-Item (Join-Path $desktop 'src-tauri\target\release\PinchDrop.exe') $layout
python (Join-Path $here 'make-assets.py') (Join-Path $layout 'Assets')
(Get-Content (Join-Path $here 'AppxManifest.template.xml') -Raw) `
  -replace '\{\{NAME\}\}', $id.name `
  -replace '\{\{PUBLISHER\}\}', $id.publisher `
  -replace '\{\{PUBLISHER_DISPLAY\}\}', $id.publisherDisplayName `
  -replace '\{\{VERSION\}\}', $version |
  Set-Content -Encoding utf8 (Join-Path $layout 'AppxManifest.xml')

$makeappx = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\makeappx.exe" | Sort-Object FullName | Select-Object -Last 1
if (-not $makeappx) { throw 'makeappx.exe not found: install the Windows 10/11 SDK.' }
$out = Join-Path $here 'PinchDrop.msix'
& $makeappx.FullName pack /o /d $layout /p $out
Write-Host "Built $out ($version). Upload it in Partner Center: your app > Packages."
