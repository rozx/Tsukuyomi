# DigitalOcean App Platform 部署指南

本指南将帮助你将 Luna AI Translator 部署到 DigitalOcean App Platform。

## 部署前准备

### 1. 确保所有文件已提交

在部署之前，确保以下文件已提交到 Git：

```bash
# 检查未提交的文件
git status

# 提交所有更改
git add .
git commit -m "Prepare for DigitalOcean deployment"
git push origin main
```

**重要文件：**
- ✅ `app.yaml` 或 `app.yaml.full`
- ✅ `package.json`
- ✅ `bun.lock` (Bun 的锁文件)
- ✅ `server/proxy-server.ts`
- ✅ `server/app-server.ts` (如果使用完整应用部署)

### 2. 确保 GitHub 仓库已准备好

- 代码已推送到 GitHub
- 仓库是公开的，或者已授权 DigitalOcean 访问私有仓库

## 部署方式选择

项目支持两种部署方式：

### 方式 1：分离部署（推荐用于生产环境）

**配置文件：** `app.yaml`

**特点：**
- 前端（静态站点）和后端（API 代理）分别部署
- 可以独立扩展
- 前端使用 CDN，性能更好

**适用场景：**
- 需要独立扩展前端和后端
- 希望前端使用 CDN 加速

### 方式 2：完整应用部署

**配置文件：** `app.yaml.full`

**特点：**
- 前端和后端整合在一个服务中
- 部署更简单
- 单个服务管理

**适用场景：**
- 简单部署
- 不需要独立扩展

## 部署步骤

### 步骤 1：登录 DigitalOcean

1. 访问 [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
2. 登录你的账户（如果没有账户，先注册）

### 步骤 2：创建新应用

1. 点击 **"Create App"** 按钮
2. 选择 **"GitHub"** 作为源代码来源
3. 如果首次使用，需要授权 DigitalOcean 访问你的 GitHub 账户
4. 选择你的仓库：`rozx/luna-ai-translator`
5. 选择分支：`main`
6. 点击 **"Next"**

### 步骤 3：选择部署方式

#### 选项 A：使用配置文件（推荐）

1. 在 "Configure App" 页面，选择 **"Edit app.yaml"** 或 **"Use app.yaml"**
2. 根据你选择的部署方式：
   - **分离部署**：确保使用 `app.yaml`
   - **完整应用**：将 `app.yaml.full` 重命名为 `app.yaml`，或直接使用

#### 选项 B：手动配置

如果选择手动配置，按照以下步骤：

**对于分离部署：**

1. **配置前端（Static Site）：**
   - 点击 "Add Component"
   - 选择 "Static Site"
   - 配置：
     - **Build Command**: 
       ```bash
       curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH" && bun install --frozen-lockfile && bun run build:spa
       ```
     - **Output Directory**: `dist/spa`
     - **HTTP Port**: `8080` (默认)
     - **Routes**: `/` → 指向静态站点
     - **Catchall Document**: `index.html`
   - 环境变量：
     - `NODE_ENV=production` (Scope: Build Time)

2. **配置后端（Web Service）：**
   - 点击 "Add Component"
   - 选择 "Web Service"
   - 配置：
     - **Build Command**: 
       ```bash
       curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH" && bun install --frozen-lockfile && test -f server/proxy-server.ts || (echo "Error: server/proxy-server.ts not found" && exit 1)
       ```
     - **Run Command**: 
       ```bash
       export PATH="$HOME/.bun/bin:$PATH" && bun run server/proxy-server.ts
       ```
     - **HTTP Port**: `8080`
     - **Routes**: `/api` → 指向 Web Service
   - 环境变量：
     - `NODE_ENV=production` (Scope: Run Time)

**对于完整应用部署：**

1. **配置 Web Service：**
   - 点击 "Add Component"
   - 选择 "Web Service"
   - 配置：
     - **Build Command**: 
       ```bash
       curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH" && bun install --frozen-lockfile && bun run build:spa
       ```
     - **Run Command**: 
       ```bash
       export PATH="$HOME/.bun/bin:$PATH" && bun run start:app
       ```
     - **HTTP Port**: `8080`
     - **Routes**: `/` → 指向 Web Service
   - 环境变量：
     - `NODE_ENV=production` (Scope: Run Time)

### 步骤 4：配置环境变量

在 "Environment Variables" 部分，确保以下变量已设置：

- `NODE_ENV=production` (根据组件类型选择 Build Time 或 Run Time)

### 步骤 5：选择资源规格

- **Instance Size**: `Basic XXS` (最小规格，适合测试)
- **Instance Count**: `1` (可根据需要调整)

### 步骤 6：部署

1. 点击 **"Create Resources"** 或 **"Deploy"**
2. DigitalOcean 将开始构建和部署你的应用
3. 构建过程可能需要 5-10 分钟

### 步骤 7：等待部署完成

1. 在 DigitalOcean 控制台查看构建日志
2. 确保构建成功（绿色 ✓）
3. 如果构建失败，查看错误日志并修复问题

## 验证部署

### 1. 检查应用状态

在 DigitalOcean 控制台：
- 应用状态应为 **"Live"**
- 所有组件应为 **"Running"**

### 2. 访问应用

1. 点击应用名称进入详情页
2. 找到 **"Live App"** 或 **"App URL"**
3. 点击链接访问应用

### 3. 测试功能

- ✅ 前端页面正常加载
- ✅ API 代理正常工作（测试 `/api/*` 端点）
- ✅ 路由正常工作（测试不同的页面路径）

## 持续部署

如果配置了 `deploy_on_push: true`（默认已配置），每次推送到 `main` 分支时，DigitalOcean 会自动触发新的部署。

### 手动触发部署

1. 在 DigitalOcean 控制台进入应用
2. 点击 **"Actions"** 标签
3. 点击 **"Create Deployment"**
4. 选择要部署的分支和提交

## 故障排除

### 构建失败

**问题：** Bun 安装失败

**解决方案：**
- 检查构建日志中的错误信息
- 确保构建命令正确（包含 Bun 安装步骤）
- 尝试在本地运行相同的构建命令

**问题：** 依赖安装失败

**解决方案：**
- 确保 `bun.lock` 文件已提交到 Git
- 检查 `package.json` 中的依赖是否正确
- 尝试清除构建缓存并重新部署

### 运行时错误

**问题：** 应用无法启动

**解决方案：**
- 检查运行命令是否正确
- 查看运行时日志
- 确保 `server/proxy-server.ts` 或 `server/app-server.ts` 文件存在

**问题：** API 代理不工作

**解决方案：**
- 检查路由配置（`/api` 应指向 Web Service）
- 查看 Web Service 的日志
- 测试代理端点是否可访问

### 前端路由 404 错误

**解决方案：**
- 确保 `catchall_document: index.html` 已配置（静态站点）
- 或确保 `app-server.ts` 中的 History 路由处理正确（完整应用）

## 成本估算

DigitalOcean App Platform 定价：

- **Basic XXS**: $5/月（适合测试和小型应用）
- **Basic XS**: $12/月
- **Basic S**: $24/月

**注意：** 分离部署会创建两个组件，成本会相应增加。

## 下一步

部署成功后，你可以：

1. **配置自定义域名**
   - 在应用设置中添加自定义域名
   - 配置 DNS 记录

2. **设置环境变量**
   - 添加 API 密钥等敏感信息
   - 使用环境变量而不是硬编码

3. **监控应用**
   - 查看应用指标
   - 设置告警

4. **扩展应用**
   - 增加实例数量
   - 升级实例规格

## 有用的链接

- [DigitalOcean App Platform 文档](https://docs.digitalocean.com/products/app-platform/)
- [Bun 文档](https://bun.sh/docs)
- [Quasar 部署指南](https://quasar.dev/quasar-cli-vite/developing-spa/deploying-spa)

## 需要帮助？

如果遇到问题：

1. 查看 DigitalOcean 的构建和运行时日志
2. 检查 GitHub Issues
3. 联系 DigitalOcean 支持

