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

# 注意：Chrome 系统依赖应在 app.yaml 中通过 apt 配置安装
# 这里仅作为后备方案（如果构建环境需要）
echo "📦 检查 Chrome 系统依赖..."
if command -v apt-get &> /dev/null && [ -w /etc/apt ]; then
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
    2>/dev/null || echo "⚠️  系统依赖将在运行时通过 app.yaml 配置安装"
  set -e
fi

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

