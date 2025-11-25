#!/bin/bash
# 运行脚本 - 用于 DigitalOcean App Platform 运行阶段
# 安装 Bun（如果需要）并启动应用服务器

set -e  # 遇到错误立即退出

echo "🚀 启动应用..."

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

# 安装 Chrome 系统依赖
# 注意：在 DigitalOcean App Platform 中，如果没有 root 权限，这些依赖可能无法安装
# 建议使用 Dockerfile 部署以获得完全控制
echo "📦 尝试安装 Chrome 系统依赖..."
if command -v apt-get &> /dev/null && [ "$EUID" -eq 0 ]; then
  set +e  # 临时禁用错误退出
  apt-get update -qq && \
  apt-get install -y -qq \
    libnspr4 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libatspi2.0-0 \
    libgtk-3-0 \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    xdg-utils \
    2>/dev/null && echo "✅ 系统依赖安装成功" || echo "⚠️  系统依赖安装失败（可能需要使用 Dockerfile 部署）"
  set -e  # 重新启用错误退出
elif command -v apt-get &> /dev/null; then
  echo "⚠️  无 root 权限，无法安装系统依赖"
  echo "💡 建议：使用 Dockerfile 部署以获得完全控制，或联系平台支持安装系统包"
else
  echo "⚠️  非 Debian/Ubuntu 系统，跳过系统依赖安装"
fi

# 确保 Puppeteer Chrome 浏览器已安装
echo "🌐 检查 Puppeteer Chrome 浏览器..."
set +e  # 临时禁用错误退出，允许 Chrome 安装失败
bunx puppeteer browsers install chrome 2>/dev/null || echo "⚠️  Chrome 安装失败，尝试继续运行..."
set -e  # 重新启用错误退出

# 启动应用服务器
echo "🌐 启动应用服务器..."
bun run start:app

