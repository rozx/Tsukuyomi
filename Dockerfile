# 使用官方 Bun 镜像作为基础
FROM oven/bun:1 AS builder

# 安装 Chrome 系统依赖
RUN apt-get update && apt-get install -y -qq \
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
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 复制依赖文件和 Quasar 配置文件（postinstall 需要这些文件来识别项目）
# 注意：复制顺序很重要，先复制 package.json 和 lockfile 可以更好地利用 Docker 缓存
COPY package.json bun.lock ./
COPY quasar.config.ts index.html ./
# 复制 vite-plugins 目录（quasar.config.ts 需要导入它）
COPY vite-plugins ./vite-plugins
# 复制 TypeScript 配置文件
COPY tsconfig.json ./
COPY eslint.config.js ./

# 安装依赖（这会运行 postinstall，执行 quasar prepare）
RUN bun install --frozen-lockfile

# 安装 Puppeteer Chrome 浏览器
RUN bunx puppeteer browsers install chrome

# 复制源代码（在所有其他文件之后，以便更好地利用缓存）
# 这会复制所有剩余的文件，包括 src/, public/, 配置文件等
# .dockerignore 确保不会复制不必要的文件（如 node_modules, .git 等）
COPY . .

# 构建前端应用
RUN bun run build:spa

# 生产阶段
FROM oven/bun:1

# 安装 Chrome 系统依赖（运行时也需要）
RUN apt-get update && apt-get install -y -qq \
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
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 从构建阶段复制依赖和构建产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lock ./

# 安装 Puppeteer Chrome 浏览器（生产环境也需要）
RUN bunx puppeteer browsers install chrome || echo "Chrome will be downloaded on first run"

# 暴露端口
EXPOSE 8080

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=8080

# 启动应用
CMD ["bun", "run", "server/app-server.ts"]

