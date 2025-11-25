#!/bin/bash
# 构建脚本 - 用于 DigitalOcean App Platform 构建阶段
# 安装 Bun，安装依赖，并构建前端应用

set -e  # 遇到错误立即退出

echo "🔨 开始构建..."

# 安装 Bun（如果尚未安装）
if ! command -v bun &> /dev/null; then
  echo "📦 安装 Bun..."
  curl -fsSL https://bun.sh/install | bash
fi

# 将 Bun 添加到 PATH
export PATH="$HOME/.bun/bin:$PATH"

# 验证 Bun 安装
if ! command -v bun &> /dev/null; then
  echo "❌ 错误: Bun 安装失败"
  exit 1
fi

echo "✅ Bun 版本: $(bun --version)"

# 安装依赖
echo "📦 安装依赖..."
bun install --frozen-lockfile

# 安装 Puppeteer Chrome 浏览器
echo "🌐 安装 Puppeteer Chrome 浏览器..."
bunx puppeteer browsers install chrome || echo "⚠️  Chrome 安装失败，将在运行时重试"

# 构建前端应用
echo "🏗️  构建前端应用..."
bun run build:spa

echo "✅ 构建完成！"

