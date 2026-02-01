# Setup script to configure git hooks from .githooks directory (Windows PowerShell version)

Write-Host "Setting up git hooks..." -ForegroundColor Cyan

# Get the absolute path of the project root
$projectRoot = Split-Path -Parent $PSScriptRoot

# Configure git to use the .githooks directory
git config core.hooksPath "$projectRoot\.githooks"

# Make the pre-commit hook executable (not needed on Windows, but kept for consistency)
# On Windows, git hooks are executed directly without needing executable permissions

Write-Host "Git hooks configured successfully" -ForegroundColor Green
Write-Host "   Hooks directory: $projectRoot\.githooks" -ForegroundColor Gray
Write-Host ""
Write-Host "The pre-commit hook will automatically bump the build version on every commit." -ForegroundColor Yellow
Write-Host "To disable this hook, run: git config --unset core.hooksPath" -ForegroundColor Yellow
