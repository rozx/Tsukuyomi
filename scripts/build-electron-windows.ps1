# Windows Electron 构建脚本
# 此脚本会清理缓存并以正确的方式构建 Electron 应用

Write-Host "清理 electron-builder 缓存..." -ForegroundColor Yellow
$cachePath = "$env:LOCALAPPDATA\electron-builder\Cache"
if (Test-Path $cachePath) {
    Remove-Item -Path $cachePath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "缓存已清理" -ForegroundColor Green
}

Write-Host "`n检查 Windows 开发者模式..." -ForegroundColor Yellow
$devMode = Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" -Name "AllowDevelopmentWithoutDevLicense" -ErrorAction SilentlyContinue

if ($devMode -and $devMode.AllowDevelopmentWithoutDevLicense -eq 1) {
    Write-Host "✓ 开发者模式已启用" -ForegroundColor Green
} else {
    Write-Host "⚠ 开发者模式未启用" -ForegroundColor Yellow
    Write-Host "  建议启用开发者模式以避免符号链接权限问题：" -ForegroundColor Yellow
    Write-Host "  1. 打开 Windows 设置 (Win + I)" -ForegroundColor Cyan
    Write-Host "  2. 转到 隐私和安全性 > 开发者选项" -ForegroundColor Cyan
    Write-Host "  3. 启用 开发者模式" -ForegroundColor Cyan
    Write-Host ""
    $continue = Read-Host "是否继续构建？(y/n)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        Write-Host "构建已取消" -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n开始构建 Electron 应用..." -ForegroundColor Yellow
Write-Host "设置环境变量以禁用代码签名..." -ForegroundColor Cyan

$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
$env:WIN_CSC_LINK = ""
$env:WIN_CSC_KEY_PASSWORD = ""

bun run build:electron

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ 构建成功！" -ForegroundColor Green
} else {
    Write-Host "`n✗ 构建失败" -ForegroundColor Red
    Write-Host "`n如果遇到符号链接权限错误，请尝试以下解决方案：" -ForegroundColor Yellow
    Write-Host "1. 启用 Windows 开发者模式（推荐）" -ForegroundColor Cyan
    Write-Host "2. 以管理员权限运行此脚本" -ForegroundColor Cyan
    Write-Host "3. 查看 docs/ELECTRON_BUILD_WINDOWS_FIX.md 了解更多信息" -ForegroundColor Cyan
    exit $LASTEXITCODE
}



