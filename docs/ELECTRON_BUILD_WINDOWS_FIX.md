# Windows 构建符号链接权限问题解决方案

## 问题描述

在 Windows 上构建 Electron 应用时，可能会遇到以下错误：

```
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
```

这是因为 electron-builder 在解压代码签名工具时需要创建符号链接，而 Windows 默认需要管理员权限或开发者模式才能创建符号链接。

## 解决方案

### 方案 1：启用 Windows 开发者模式（推荐）

这是最简单且永久的解决方案：

1. 打开 **Windows 设置**（Win + I）
2. 转到 **更新和安全** > **开发者选项**（或 **隐私和安全性** > **开发者选项**）
3. 启用 **开发者模式**
4. 重新运行构建命令：`bun run build:electron`

启用开发者模式后，普通用户也可以创建符号链接，无需管理员权限。

### 方案 2：以管理员权限运行

1. 右键点击 PowerShell 或终端
2. 选择 **以管理员身份运行**
3. 导航到项目目录
4. 运行构建命令：`bun run build:electron`

### 方案 3：清理缓存后重试

如果缓存损坏，可以清理 electron-builder 缓存：

```powershell
Remove-Item -Path "$env:LOCALAPPDATA\electron-builder\Cache" -Recurse -Force
```

然后重新运行构建命令。

### 方案 4：使用 WSL（Windows Subsystem for Linux）

如果安装了 WSL，可以在 WSL 环境中构建：

```bash
# 在 WSL 中
cd /mnt/d/Projects/Luna-Ai/tsukuyomi-translator
bun run build:electron
```

## 当前配置

项目已配置为禁用代码签名：
- `forceCodeSigning: false` - 在 `quasar.config.ts` 中
- `CSC_IDENTITY_AUTO_DISCOVERY=false` - 在构建脚本中

即使禁用了代码签名，electron-builder 仍可能尝试下载工具包（用于其他用途），因此仍需要解决符号链接权限问题。

## 推荐方案

**强烈推荐使用方案 1（启用开发者模式）**，因为：
- 一次设置，永久有效
- 不需要每次都以管理员权限运行
- 不会影响系统安全性
- 是 Windows 10/11 的标准功能

