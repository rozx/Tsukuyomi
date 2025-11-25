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

# 确保 Puppeteer Chrome 浏览器已安装
echo "🌐 检查 Puppeteer Chrome 浏览器..."
set +e  # 临时禁用错误退出，允许 Chrome 安装失败
bunx puppeteer browsers install chrome 2>/dev/null || echo "⚠️  Chrome 安装失败，尝试继续运行..."
set -e  # 重新启用错误退出

# 启动应用服务器
echo "🌐 启动应用服务器..."
bun run start:app

