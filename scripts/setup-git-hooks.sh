#!/usr/bin/env bash
# Setup script to configure git hooks from .githooks directory

echo "🔧 Setting up git hooks..."

# Get the absolute path of the project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Configure git to use the .githooks directory
git config core.hooksPath "${PROJECT_ROOT}/.githooks"

# Make the pre-commit hook executable
chmod +x "${PROJECT_ROOT}/.githooks/pre-commit"

echo "✅ Git hooks configured successfully"
echo "   Hooks directory: ${PROJECT_ROOT}/.githooks"
echo ""
echo "ℹ️  The pre-commit hook will automatically bump the build version on every commit."
echo "   To disable this hook, run: git config --unset core.hooksPath"
