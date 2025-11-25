# GitHub Actions 故障排除指南

## Release 创建失败：权限问题

### 错误信息
```
HTTP 422: Validation Failed
author_id does not have push access to rozx/luna-ai-translator
```

### 原因
这个错误通常表示 GitHub Actions 工作流没有足够的权限来创建 release。

### 解决方案

#### 1. 检查仓库的 Actions 权限设置

1. 进入仓库的 **Settings**（设置）
2. 点击左侧菜单的 **Actions** > **General**
3. 滚动到 **Workflow permissions**（工作流权限）部分
4. 确保选择了 **Read and write permissions**（读写权限）
   - 不要选择 "Read repository contents and packages permissions"（只读权限）
5. 点击 **Save**（保存）

#### 2. 验证工作流文件中的权限配置

确保 `.github/workflows/release.yml` 文件中包含正确的权限设置：

```yaml
permissions:
  contents: write
  pull-requests: read

jobs:
  create-release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: read
```

#### 3. 检查是否在正确的仓库上运行

- 如果这是一个 fork，工作流默认无法写入上游仓库
- 确保工作流在主仓库（`rozx/luna-ai-translator`）上运行，而不是在 fork 上

#### 4. 使用个人访问令牌（PAT）（可选）

如果上述方法不起作用，可以考虑使用个人访问令牌（Personal Access Token）：

1. 创建个人访问令牌：
   - 进入 GitHub Settings > Developer settings > Personal access tokens > Tokens (classic)
   - 创建新令牌，选择 `repo` 权限
   - 复制令牌

2. 在仓库中添加 Secret：
   - 进入仓库 Settings > Secrets and variables > Actions
   - 点击 **New repository secret**
   - 名称：`GH_PAT`
   - 值：粘贴你的个人访问令牌

3. 修改工作流文件，使用 PAT 而不是 GITHUB_TOKEN：
   ```yaml
   env:
     GH_TOKEN: ${{ secrets.GH_PAT }}
   ```

### 验证修复

修复后，重新运行工作流。工作流现在应该能够：
- ✅ 创建 Git 标签
- ✅ 创建 GitHub Release
- ✅ 上传发布资源

### 其他常见问题

#### 问题：工作流在 fork 上运行
**解决方案**：确保工作流在主仓库上运行，或者配置 fork 工作流权限。

#### 问题：标签已存在但 release 不存在
**解决方案**：工作流会自动检测这种情况并创建 release（见 `Create Release for Existing Tag` 步骤）。

#### 问题：权限设置正确但仍失败
**解决方案**：
1. 检查 GitHub Actions 的运行日志，查看详细的错误信息
2. 确认仓库所有者或管理员已启用 Actions
3. 验证 `GITHUB_TOKEN` 没有被其他设置覆盖

