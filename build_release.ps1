param (
    [string]$Version = "1.1.0"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   AURION - AUTOMATED RELEASE PIPELINE   " -ForegroundColor Cyan
Write-Host "   Versión objetivo: v$Version            " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Limpieza de compilaciones previas
Write-Host "`n[1/5] Limpiando carpetas build y dist..." -ForegroundColor Yellow
if (Test-Path "build") { Remove-Item -Recurse -Force "build" }
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }

# 2. Compilación directa utilizando aurion.spec
Write-Host "`n[2/5] Compilando ejecutable usando aurion.spec..." -ForegroundColor Yellow
pyinstaller --noconfirm aurion.spec

if (-not (Test-Path "dist/Aurion/Aurion.exe")) {
    Write-Host "[ERROR] No se pudo encontrar el ejecutable en dist/Aurion/Aurion.exe" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Compilación completada con éxito." -ForegroundColor Green

# 3. Empaquetar ZIP distribuible
Write-Host "`n[3/5] Comprimiendo paquete distribuible para GitHub..." -ForegroundColor Yellow
$zipPath = "dist/Aurion-v$Version-win64.zip"
Compress-Archive -Path "dist/Aurion/*" -DestinationPath $zipPath -Force
Write-Host "[OK] Archivo ZIP creado en: $zipPath" -ForegroundColor Green

# 4. Git Tag y Push automático
Write-Host "`n[4/5] Creando Tag y subiendo a GitHub..." -ForegroundColor Yellow
$tag = "v$Version"
git add .
git commit -m "chore(release): prepare release $tag" --allow-empty
git tag -a $tag -m "Release ${tag}: full pipeline optimization, accurate season detection and clean lifecycle"
git push origin main --tags

Write-Host "`n[5/5] ¡Pipeline de Release finalizado con éxito!" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "El archivo listo para subir a GitHub Releases es:" -ForegroundColor White
Write-Host " -> $zipPath" -ForegroundColor Yellow
Write-Host "=======================================================" -ForegroundColor Cyan