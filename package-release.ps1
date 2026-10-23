$ErrorActionPreference = 'Stop'
$source = $PSScriptRoot
$outputRoot = Split-Path -Parent $source
$version = (Get-Content -Raw -LiteralPath (Join-Path $source 'VERSION')).Trim()
$dist = Join-Path $outputRoot ("study-supervisor-local-v" + $version)
$zip = $dist + '.zip'

$resolvedOutput = [System.IO.Path]::GetFullPath($outputRoot)
$resolvedDist = [System.IO.Path]::GetFullPath($dist)
if (-not $resolvedDist.StartsWith($resolvedOutput + [System.IO.Path]::DirectorySeparatorChar)) { throw 'Unsafe distribution path.' }
if (Test-Path -LiteralPath $dist) { Remove-Item -Recurse -Force -LiteralPath $dist }
if (Test-Path -LiteralPath $zip) { Remove-Item -Force -LiteralPath $zip }
New-Item -ItemType Directory -Path $dist | Out-Null
New-Item -ItemType Directory -Path (Join-Path $dist 'tests') | Out-Null
New-Item -ItemType Directory -Path (Join-Path $dist 'docs') | Out-Null

$files = @(
  'index.html','styles.css','responsive.css','homework-tasks.js','app.js','daily-report.ts','daily-report.js','daily-report.css','tsconfig.json','supervision.js','supervision.css',
  'whiteboard.js','whiteboard.css','kimi.js','voice-class.js','teaching-visuals.js','learning-library.js','learning-library.css','classroom-archive.js','classroom-archive.css','review-protocol.js','pwa.js','sw.js','manifest.webmanifest','app-icon.svg','server.js','favicon.ico',
  'Dockerfile','.dockerignore','render.yaml',
  'package.json','package-lock.json','.env.example','.gitignore','README.md','INSTALL.md',
  'PRIVACY.md','TERMS_TEMPLATE.md','LICENSE','NOTICE','THIRD_PARTY_NOTICES.md','VERSION','CHANGELOG.md',
  'package-release.ps1','start-study-supervisor.bat','启动学习督导台.bat'
)
foreach ($name in $files) { Copy-Item -LiteralPath (Join-Path $source $name) -Destination (Join-Path $dist $name) }
Copy-Item -LiteralPath (Join-Path $source 'tests\check.js') -Destination (Join-Path $dist 'tests\check.js')
Copy-Item -LiteralPath (Join-Path $source 'tests\homework-tasks-check.js') -Destination (Join-Path $dist 'tests\homework-tasks-check.js')
Copy-Item -LiteralPath (Join-Path $source 'docs\OPEN_SOURCE_IMPROVEMENTS.md') -Destination (Join-Path $dist 'docs\OPEN_SOURCE_IMPROVEMENTS.md')
Copy-Item -LiteralPath (Join-Path $source 'tests\cloud-proxy-check.js') -Destination (Join-Path $dist 'tests\cloud-proxy-check.js')
Copy-Item -LiteralPath (Join-Path $source 'docs\CLOUD_DEPLOYMENT.md') -Destination (Join-Path $dist 'docs\CLOUD_DEPLOYMENT.md')
Copy-Item -LiteralPath (Join-Path $source 'docs\PAID_SERVICES.md') -Destination (Join-Path $dist 'docs\PAID_SERVICES.md')

# PDF.js is a local runtime asset. Include the minimal browser build so buyers retain
# PDF-to-annotation capability without a separate install.
$pdfSource = Join-Path $source 'node_modules\pdfjs-dist\build'
$pdfTarget = Join-Path $dist 'node_modules\pdfjs-dist\build'
if (-not (Test-Path -LiteralPath $pdfSource)) { throw 'PDF.js runtime assets are missing. Run npm install before packaging.' }
New-Item -ItemType Directory -Force -Path $pdfTarget | Out-Null
foreach ($asset in @('pdf.min.mjs','pdf.worker.min.mjs')) { Copy-Item -LiteralPath (Join-Path $pdfSource $asset) -Destination (Join-Path $pdfTarget $asset) }

if (Test-Path -LiteralPath (Join-Path $dist '.env')) { throw 'Security check failed: .env was included.' }
$forbidden = Get-ChildItem -Recurse -File -LiteralPath $dist | Where-Object { $_.Name -match 'preview|server\.log|server-error\.log' }
if ($forbidden) { throw 'Security check failed: private/test artifacts were included.' }
if (-not (Test-Path -LiteralPath (Join-Path $pdfTarget 'pdf.min.mjs'))) { throw 'PDF.js was not included in the distribution.' }

Compress-Archive -LiteralPath $dist -DestinationPath $zip -CompressionLevel Optimal
Write-Output "Distribution folder: $dist"
Write-Output "Distribution archive: $zip"
