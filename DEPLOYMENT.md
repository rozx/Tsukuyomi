# DigitalOcean App Platform 部署指南

本指南将帮助你将 Luna AI Translator 部署到 DigitalOcean App Platform。

## 前置要求

1. DigitalOcean 账户
2. GitHub 仓库（代码已推送到 GitHub）
3. 确保项目可以正常构建

## 部署步骤

### 方法一：在控制台中手动配置（强烈推荐）

由于 DigitalOcean 可能会自动检测 `package.json` 并使用 Node.js Buildpack（导致需要启动命令的错误），**强烈建议在控制台中手动配置为静态站点**：

1. **在 DigitalOcean 控制台创建应用**
   - 登录 [DigitalOcean 控制台](https://cloud.digitalocean.com/apps)
   - 点击 "Create App"
   - 选择 "GitHub" 作为源代码来源
   - 授权 DigitalOcean 访问你的 GitHub 账户
   - 选择你的仓库 `luna-ai-translator`
   - 选择分支（通常是 `main`）

2. **重要：手动配置为静态站点**
   - 在 "Configure App" 页面，**不要**使用自动检测的配置
   - 点击 "Edit" 或 "Add Component"
   - **选择 "Static Site" 类型**（不是 Web Service）
   - 配置以下设置：
     - **Build Command**: `curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH" && bun install && bun run build:spa`
       - 或者使用 npm：`npm install && npm run build:spa`
     - **Output Directory**: `dist/spa`
     - **HTTP Port**: 8080（默认，静态站点会自动处理）
     - **Routes**: `/` → 指向静态站点
     - **Catchall Document**: `index.html`

3. **配置环境变量**
   - 在 "Environment Variables" 部分，添加：
     - Key: `NODE_ENV`
     - Value: `production`
     - Scope: `Build Time`

4. **部署**
   - 点击 "Create Resources" 或 "Deploy"
   - DigitalOcean 会自动构建并部署你的应用

### 方法二：使用 app.yaml 配置文件

**注意**：如果使用 `app.yaml`，DigitalOcean 可能会自动检测 `package.json` 并使用 Node.js Buildpack，导致需要启动命令的错误。如果遇到此问题，请使用方法一（手动配置）。

1. **确保 app.yaml 配置正确**
   - 打开 `app.yaml` 文件
   - 将 `github.repo` 替换为你的实际 GitHub 仓库路径（格式：`username/repo-name`）
   - 确认 `branch` 设置为正确的分支名称（通常是 `main` 或 `master`）

2. **在 DigitalOcean 控制台创建应用**
   - 登录 [DigitalOcean 控制台](https://cloud.digitalocean.com/apps)
   - 点击 "Create App"
   - 选择 "GitHub" 作为源代码来源
   - 授权 DigitalOcean 访问你的 GitHub 账户
   - 选择你的仓库 `luna-ai-translator`
   - 选择分支（通常是 `main`）
   - 在 "Configure App" 页面，选择 "Edit app.yaml" 或直接使用项目根目录的 `app.yaml` 文件
   - **重要**：如果看到自动检测为 "Web Service"，请手动改为 "Static Site"

3. **配置环境变量（可选）**
   - 在 App Platform 控制台中，进入你的应用
   - 导航到 "Settings" > "App-Level Environment Variables"
   - 添加任何需要的环境变量（例如 API 密钥等）

4. **部署**
   - 点击 "Create Resources" 或 "Deploy"
   - DigitalOcean 会自动构建并部署你的应用

### 方法二：通过控制台手动配置

如果不想使用 `app.yaml`，可以手动配置：

1. **创建应用**
   - 登录 DigitalOcean 控制台
   - 创建新应用，连接到 GitHub 仓库

2. **配置构建设置**
   - **Build Command**: `curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH" && bun install && bunx quasar build -m spa`
     - 或者使用 npm：`npm install && npx quasar build -m spa`
   - **Output Directory**: `dist/spa`
   - **HTTP Port**: 8080（默认，静态站点会自动处理）

3. **配置路由**
   - 添加路由：`/` → 指向静态站点
   - 设置 Catchall Document 为 `index.html`（用于 SPA 路由）

4. **环境变量**
   - 添加 `NODE_ENV=production`

## 重要注意事项

### 1. 代理配置限制

⚠️ **重要**：当前应用在开发环境中使用了多个代理配置（`quasar.config.ts` 中的 `server.proxy`）。这些代理配置**仅在开发环境中有效**，在生产环境的静态站点中**不会工作**。

如果应用需要调用这些 API：
- **选项 A**：在客户端直接调用 API（如果支持 CORS）
- **选项 B**：创建一个后端服务来处理代理请求
- **选项 C**：使用 DigitalOcean Functions 或 App Platform 的 Web Service 组件来处理代理

### 2. 构建输出目录

Quasar 构建 SPA 时，默认输出到 `dist/spa` 目录。确保 `app.yaml` 中的 `output_dir` 设置为 `dist/spa`。

### 3. Node.js 版本

确保 `package.json` 中的 `engines.node` 版本与 DigitalOcean 支持的版本兼容。当前配置支持 Node.js 20+。

### 4. 包管理器

项目使用 **Bun** 作为包管理器。`app.yaml` 中的构建命令已经配置为：
1. 安装 Bun（如果构建环境中未预装）
2. 使用 Bun 安装依赖
3. 使用 Bun 执行 Quasar 构建

如果 Bun 安装失败或遇到问题，可以回退到使用 npm：
- 修改 `app.yaml` 中的 `build_command` 为：`npm install && npx quasar build -m spa`
- 或者：`npm ci && npm run build`（如果 package.json 中有 build 脚本）

### 5. History 路由模式

✅ **应用已配置为使用 History 路由模式**（`quasar.config.ts` 中 `vueRouterMode: 'history'`）。

**History 路由模式的优势：**
- URL 格式：`https://your-domain.com/path/to/page`（更美观，没有 `/#/`）
- 更符合传统 URL 格式，SEO 友好
- 用户体验更好，URL 更简洁

**History 路由模式的要求：**
- **必须**配置 `catchall_document: index.html`（已在 `app.yaml` 中配置）
- 服务器需要将所有路由重定向到 `index.html`（DigitalOcean App Platform 会自动处理）
- 所有路由请求都会先返回 `index.html`，然后由 Vue Router 在客户端处理

**注意**：如果将来想切换回 Hash 模式，需要：
1. 修改 `quasar.config.ts` 中的 `vueRouterMode` 为 `'hash'`
2. Hash 模式下不需要 `catchall_document`，但保留也无妨

## 验证部署

部署完成后：

1. 访问 DigitalOcean 提供的应用 URL
2. 检查应用是否正常加载
3. 测试主要功能
4. 检查浏览器控制台是否有错误

## 持续部署

如果配置了 `deploy_on_push: true`，每次推送到指定分支时，DigitalOcean 会自动触发新的部署。

## 故障排除

### 构建失败

1. 检查构建日志中的错误信息
2. 确保所有依赖都已正确安装
3. 验证 Node.js 版本兼容性
4. **如果 Bun 安装失败**：
   - 检查网络连接（Bun 安装需要从 GitHub 下载）
   - 尝试使用 npm 作为备选方案：修改构建命令为 `npm install && npx quasar build -m spa`
   - 确保构建环境有足够的权限安装 Bun

### 构建警告

**`Warning: no analyzed metadata found at path '/layers/analyzed.toml'`**

这是一个常见的警告，通常可以**安全忽略**。这个警告出现在 DigitalOcean App Platform 尝试分析构建层元数据时，对于静态站点部署不会影响功能。

- **原因**：DigitalOcean 的 Buildpacks 系统会尝试查找构建分析的元数据文件，但静态站点构建可能不会生成这个文件
- **影响**：无影响，构建和部署会正常进行
- **解决方案**：无需处理，可以忽略此警告。如果警告过多，可以联系 DigitalOcean 支持团队

### 应用无法访问

1. 检查路由配置是否正确
2. 确认 `catchall_document` 设置为 `index.html`
3. 验证输出目录路径是否正确

### 启动命令错误

**`ERROR: failed to launch: determine start command: when there is no default process a command is required`**

这个错误通常表示 DigitalOcean 没有正确识别这是一个静态站点。

**解决方案：**

#### 方案 1：在控制台中手动配置（推荐）

如果 `app.yaml` 配置无法正常工作，可以在 DigitalOcean 控制台中手动配置：

1. **删除当前应用**（如果已创建）
2. **创建新应用**：
   - 登录 [DigitalOcean 控制台](https://cloud.digitalocean.com/apps)
   - 点击 "Create App"
   - 选择 "GitHub" 作为源代码来源
   - 选择你的仓库和分支

3. **配置静态站点**：
   - 在 "Components" 部分，点击 "Edit" 或 "Add Component"
   - 选择 **"Static Site"** 类型（不是 Web Service）
   - 配置以下设置：
     - **Build Command**: `curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH" && bun install && bun run build:spa`
     - **Output Directory**: `dist/spa`
     - **HTTP Port**: 8080（默认）
     - **Routes**: `/` → 指向静态站点
     - **Catchall Document**: `index.html`

4. **环境变量**：
   - 添加 `NODE_ENV=production`（Scope: Build Time）

5. **部署**：
   - 点击 "Create Resources" 或 "Deploy"

#### 方案 2：检查 app.yaml 配置

1. **确认配置格式正确**：
   - 确保使用 `static_sites` 而不是 `services`
   - 确保 `output_dir` 指向正确的构建输出目录（`dist/spa`）
   - 确保 `source_dir` 已设置（`/`）

2. **检查构建是否成功**：
   - 查看构建日志，确认构建命令成功执行
   - 确认 `dist/spa` 目录中有构建输出文件（`index.html` 等）

3. **重新部署**：
   - 如果配置已更新，重新触发部署
   - 确保 `app.yaml` 文件已正确提交到 GitHub

#### 方案 3：使用 npm 作为备选

如果 Bun 安装有问题，可以尝试使用 npm：

修改 `app.yaml` 中的构建命令为：
```yaml
build_command: npm install && npm run build:spa
```

或者如果 `build:spa` 脚本不存在，使用：
```yaml
build_command: npm install && npx quasar build -m spa
```

**注意**：确保 `package.json` 中有 `build:spa` 脚本，或者使用 `npx quasar build -m spa` 命令。

### API 调用失败

1. 检查浏览器控制台的 CORS 错误
2. 确认 API 端点是否需要代理
3. 考虑使用后端服务处理 API 请求

## 成本估算

DigitalOcean App Platform 的静态站点通常有免费套餐，但具体价格取决于：
- 流量使用量
- 构建时间
- 存储需求

查看 [DigitalOcean 定价页面](https://www.digitalocean.com/pricing/app-platform) 了解最新价格。

## 相关资源

- [DigitalOcean App Platform 文档](https://docs.digitalocean.com/products/app-platform/)
- [Quasar 部署指南](https://quasar.dev/quasar-cli-vite/developing-spa/deploying-spa)
- [Vue Router Hash 模式](https://router.vuejs.org/guide/essentials/history-mode.html#hash-mode)

