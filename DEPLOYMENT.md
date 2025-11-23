# 部署指南

本项目支持多种部署方式：

## 部署选项概览

| 部署方式 | 适用场景 | 配置文件 | 说明 |
|---------|---------|---------|------|
| **完整 Node.js 应用** | 生产环境（推荐） | `app.yaml.full` | 前端+后端整合在一个服务中 |
| **分离部署** | 需要独立扩展 | `app.yaml` | 前端和后端分别部署 |
| **Electron 桌面应用** | 桌面应用分发 | - | 构建跨平台桌面应用 |

## 1. 作为完整的 Node.js 应用部署（推荐用于生产环境）

这种方式将前端静态文件和后端 API 代理服务整合在一个 Express 服务器中。

### 构建和运行

```bash
# 1. 安装依赖
bun install

# 2. 构建前端
bun run build:spa

# 3. 启动完整应用（包含前端和后端）
bun start
# 或
bun run start:app
```

应用将在 `http://localhost:8080` 启动，同时提供：
- 前端静态文件服务
- API 代理服务（`/api/*`）

### DigitalOcean App Platform 部署

**方式 1：使用配置文件（推荐）**

使用项目根目录的 `app.yaml.full` 配置文件：

1. 将 `app.yaml.full` 重命名为 `app.yaml`（或直接使用 `app.yaml.full`）
2. 在 DigitalOcean 控制台创建应用时选择使用此配置文件
3. 确保 `github.repo` 和 `branch` 配置正确

**方式 2：手动配置**

在 DigitalOcean 控制台中手动配置：

1. 创建新的 Web Service（不是 Static Site）
2. 配置以下设置：
   - **Build Command**: `curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH" && bun install --frozen-lockfile && bun run build:spa`
   - **Run Command**: `export PATH="$HOME/.bun/bin:$PATH" && bun run start:app`
   - **HTTP Port**: `8080`
   - **Routes**: `/` → 指向服务
3. 添加环境变量：
   - `NODE_ENV=production` (Scope: RUN_TIME)

### 其他平台部署

#### Heroku

创建 `Procfile`：
```
web: bun run start:app
```

#### Railway / Render

设置构建命令：
```bash
curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH" && bun install --frozen-lockfile && bun run build:spa
```

设置启动命令：
```bash
export PATH="$HOME/.bun/bin:$PATH" && bun run start:app
```

## 2. 作为 Electron 桌面应用

构建跨平台的桌面应用（Windows、macOS、Linux）。

### 构建桌面应用

```bash
# 构建 Electron 应用
bun run build:electron
```

构建产物将位于 `dist/electron/` 目录。

### 支持的平台

- Windows (`.exe`)
- macOS (`.dmg` 或 `.app`)
- Linux (`.AppImage` 或 `.deb`)

### 发布到应用商店

可以使用以下工具发布：
- [Electron Builder](https://www.electron.build/) - 已集成在 Quasar 中
- [Electron Forge](https://www.electronforge.io/)

## 3. 分离部署（当前方式）

前端和后端分别部署：

- **前端**：静态站点（SPA）
- **后端**：API 代理服务

这种方式适合需要独立扩展前端和后端的场景。

### 当前配置

查看 `app.yaml` 了解当前的分离部署配置。

## 环境变量

### 生产环境

- `NODE_ENV=production` - 启用生产模式
- `PORT=8080` - 服务器端口（可选，默认 8080）

### 开发环境

- `NODE_ENV=development` - 开发模式
- `DEV=true` - Quasar 开发模式标志

## 故障排除

### 前端路由 404 错误

确保：
1. 使用 History 路由模式（已在 `app-server.ts` 中配置）
2. 所有非 API 路由都返回 `index.html`

### API 代理不工作

检查：
1. 代理配置是否正确（`server/app-server.ts` 或 `server/proxy-server.ts`）
2. 目标服务器是否可访问
3. CORS 配置是否正确

### 构建失败

确保：
1. Bun 已正确安装（DigitalOcean 会自动安装）
2. 所有依赖已正确安装（`bun install`）
3. TypeScript 编译通过（Bun 原生支持 TypeScript）
4. `bun.lock` 文件已提交到 Git（用于 `--frozen-lockfile`）

### Bun 安装

在 DigitalOcean 上，Bun 会在构建时自动安装。如果需要在本地安装：

```bash
curl -fsSL https://bun.sh/install | bash
```

或者使用包管理器：

```bash
# macOS
brew install bun

# Linux
curl -fsSL https://bun.sh/install | bash
```
