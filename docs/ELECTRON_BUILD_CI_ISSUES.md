# Electron 构建在 CI 环境中的运行时问题解决方案

## 问题描述

在 GitHub Actions 中构建的 Electron 应用虽然构建成功，但在 Windows/Mac 上运行时失败。这是一个常见问题，主要原因包括：

1. **环境变量未正确设置** - `NODE_ENV` 未设置为 `production`，导致应用误判为开发模式
2. **macOS Gatekeeper 阻止** - 未签名/未公证的应用会被 macOS 安全机制阻止
3. **Windows SmartScreen 警告** - 未签名的应用会触发 Windows 安全警告
4. **路径解析问题** - 打包后的文件路径与开发环境不同

## 已实施的修复

### 1. 环境变量设置

在 `.github/workflows/release.yml` 中，所有构建步骤现在都设置了 `NODE_ENV=production`：

```yaml
env:
  NODE_ENV: production
  GH_TOKEN: ${{ secrets.GH_PAT || secrets.GITHUB_TOKEN }}
```

### 2. 改进的环境检测

在 `src-electron/electron-main.ts` 中，环境检测逻辑已改进：

- 优先使用 `app.isPackaged`（Electron 提供的打包标志）
- 添加了详细的环境信息日志
- 改进了生产环境下的文件路径解析

### 3. 路径解析改进

生产环境现在会尝试多个可能的路径来查找 `index.html`：

- `__dirname/index.html`（标准路径）
- `__dirname/../index.html`（备用路径）
- `process.resourcesPath/index.html`（打包后的资源路径）

## macOS 代码签名和公证（可选但强烈推荐）

### 为什么需要代码签名？

未签名的 macOS 应用会被 Gatekeeper 阻止运行，用户需要：
1. 右键点击应用
2. 选择"打开"
3. 在系统偏好设置中允许运行

### 如何配置代码签名

#### 1. 获取 Apple Developer 证书

1. 注册 Apple Developer 账号（$99/年）
2. 在 [Apple Developer Portal](https://developer.apple.com/account/resources/certificates/list) 创建证书
3. 下载并安装证书到构建机器

#### 2. 配置 GitHub Secrets

在 GitHub 仓库设置中添加以下 secrets：

- `MACOS_CERTIFICATE`: Base64 编码的证书文件
- `MACOS_CERTIFICATE_PASSWORD`: 证书密码
- `APPLE_ID`: Apple ID 邮箱
- `APPLE_APP_SPECIFIC_PASSWORD`: App 专用密码（在 [appleid.apple.com](https://appleid.apple.com) 生成）

#### 3. 更新工作流文件

取消注释 `.github/workflows/release.yml` 中的代码签名配置：

```yaml
env:
  NODE_ENV: production
  GH_TOKEN: ${{ secrets.GH_PAT || secrets.GITHUB_TOKEN }}
  CSC_LINK: ${{ secrets.MACOS_CERTIFICATE }}
  CSC_KEY_PASSWORD: ${{ secrets.MACOS_CERTIFICATE_PASSWORD }}
  APPLE_ID: ${{ secrets.APPLE_ID }}
  APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
```

#### 4. 更新 quasar.config.ts

在 `electron.builder.mac` 配置中添加：

```typescript
mac: {
  icon: 'src-electron/icons/icon.icns',
  target: ['dir'],
  hardenedRuntime: true, // 启用强化运行时
  gatekeeperAssess: false, // 禁用 Gatekeeper 评估（由公证处理）
  entitlements: 'build/entitlements.mac.plist', // 权限配置（如果需要）
  entitlementsInherit: 'build/entitlements.mac.plist',
},
```

#### 5. 配置公证（Notarization）

electron-builder 会自动处理公证，前提是：
- 已配置 `APPLE_ID` 和 `APPLE_APP_SPECIFIC_PASSWORD`
- 应用已正确签名

## Windows 代码签名（可选）

### 为什么需要代码签名？

未签名的 Windows 应用会触发 SmartScreen 警告，用户可能无法直接运行。

### 如何配置代码签名

#### 1. 获取代码签名证书

- 从证书颁发机构（CA）购买代码签名证书
- 或使用自签名证书（仅用于测试，不推荐用于分发）

#### 2. 配置 GitHub Secrets

- `WINDOWS_CERTIFICATE`: Base64 编码的证书文件
- `WINDOWS_CERTIFICATE_PASSWORD`: 证书密码

#### 3. 更新工作流文件

取消注释 `.github/workflows/release.yml` 中的 Windows 代码签名配置：

```yaml
env:
  NODE_ENV: production
  GH_TOKEN: ${{ secrets.GH_PAT || secrets.GITHUB_TOKEN }}
  CSC_LINK: ${{ secrets.WINDOWS_CERTIFICATE }}
  CSC_KEY_PASSWORD: ${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}
```

#### 4. 更新 quasar.config.ts

在 `electron.builder.win` 配置中：

```typescript
win: {
  icon: 'src-electron/icons/icon.ico',
  target: ['portable'],
  // 如果配置了证书，electron-builder 会自动签名
  // forceCodeSigning: false, // 移除或设置为 true
},
```

## 调试运行时问题

### 1. 启用调试模式

在构建时设置 `ELECTRON_DEBUG=true`：

```bash
ELECTRON_DEBUG=true bun run build:electron
```

或在 GitHub Actions 中：

```yaml
env:
  ELECTRON_DEBUG: 'true'
```

### 2. 查看日志

应用启动时会输出详细的环境信息和路径信息到控制台。如果应用无法启动：

1. **macOS**: 在终端中运行应用查看日志
   ```bash
   /path/to/app.app/Contents/MacOS/app-name
   ```

2. **Windows**: 查看事件查看器或使用 PowerShell 运行
   ```powershell
   & "path\to\app.exe"
   ```

### 3. 检查文件结构

确保以下文件存在：
- `index.html` - 主 HTML 文件
- `electron-main.js` 或 `electron-main.cjs` - 主进程文件
- `preload/electron-preload.cjs` - Preload 脚本
- `assets/` - 静态资源目录

### 4. 常见错误

#### "index.html not found"
- 检查 `quasar.config.ts` 中的 `publicPath` 配置
- 确保 Electron 构建模式正确

#### "Preload script not found"
- 检查 `quasar.config.ts` 中的 `preloadScripts` 配置
- 确保 `asar: false`（如果使用 asar，需要特殊处理）

#### "Failed to load dev server"
- 这是正常的，应用会回退到生产构建
- 如果持续出现，检查 `NODE_ENV` 环境变量

## 测试构建

### 本地测试

```bash
# 设置生产环境
export NODE_ENV=production

# 构建
bun run build:electron

# 测试运行（macOS）
open dist/electron/Packaged/*.app

# 测试运行（Windows）
.\dist\electron\Packaged\*.exe
```

### CI 测试

在 GitHub Actions 中，构建完成后可以添加测试步骤：

```yaml
- name: Test Electron App
  if: matrix.os == 'macos-latest'
  run: |
    APP_PATH=$(find dist/electron -name "*.app" -type d | head -1)
    # 检查应用结构
    ls -la "$APP_PATH/Contents/MacOS/"
    # 尝试运行（会失败，但可以看到错误信息）
    "$APP_PATH/Contents/MacOS/"* || true
```

## 总结

1. ✅ **已修复**: 环境变量设置和路径解析
2. ⚠️ **需要配置**: macOS 代码签名和公证（用于分发）
3. ⚠️ **需要配置**: Windows 代码签名（用于分发）
4. ✅ **已改进**: 错误处理和日志记录

对于个人项目或内部使用，可以不配置代码签名，但用户需要手动允许运行未签名的应用。

