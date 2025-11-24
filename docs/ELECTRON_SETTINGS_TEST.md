# Electron 设置导入/导出测试指南

## 功能概述
在 Electron 桌面模式下，通过 File 菜单或键盘快捷键导出/导入所有应用设置（AI 模型、书籍、封面历史、同步配置等）。

## 实现架构

### 主进程 (src-electron/electron-main.ts)
- **File 菜单项**:
  - Export Settings (Cmd+E / Ctrl+E)
  - Import Settings (Cmd+I / Ctrl+I)
- **IPC 处理器**:
  - `export-settings-save`: 接收 JSON 数据并保存到用户选择的文件
  - 文件打开对话框: 读取 JSON 文件并发送给渲染进程
- **事件发送**:
  - `export-settings-request`: 触发渲染进程准备数据
  - `import-settings-data`: 将读取的 JSON 内容发送给渲染进程

### 渲染进程 (src/composables/useElectronSettings.ts)
- **监听器注册**: 在 App.vue onMounted 时自动初始化
- **导出流程**:
  1. 接收 `export-settings-request` 事件
  2. 从各个 store 收集当前数据
  3. 序列化为 JSON
  4. 通过 `export-settings-save` 发送给主进程
- **导入流程**:
  1. 接收 `import-settings-data` 事件和 JSON 内容
  2. 使用 SettingsService 验证格式
  3. 调用各 store 的 addModel/addBook 等方法导入数据

## 测试步骤

### 前提条件
1. 启动 Electron 开发模式: `bun run dev:electron` 或构建生产版本
2. 确保应用中已有测试数据（至少 1 个 AI 模型和 1 本书）

### 导出测试
1. **通过菜单**: 点击 File → Export Settings
2. **通过快捷键**: 按 Cmd+E (macOS) 或 Ctrl+E (Windows/Linux)
3. **预期行为**:
   - 打开系统保存对话框
   - 默认文件名: `luna-settings-YYYY-MM-DD.json`
   - 选择保存位置后，文件应包含完整的 JSON 数据
4. **验证数据**:
   ```json
   {
     "aiModels": [...],
     "novels": [...],
     "coverHistory": [...],
     "sync": [...],
     "appSettings": {...}
   }
   ```

### 导入测试
1. **准备测试文件**: 使用上一步导出的 JSON 文件
2. **通过菜单**: 点击 File → Import Settings
3. **通过快捷键**: 按 Cmd+I (macOS) 或 Ctrl+I (Windows/Linux)
4. **预期行为**:
   - 打开系统文件选择对话框
   - 选择有效的 JSON 文件后自动导入
   - 控制台无错误日志
5. **验证导入结果**:
   - 检查 AI Models 页面，确认模型已导入
   - 检查 Books 页面，确认书籍已导入
   - 检查应用设置，确认配置已更新

### 错误处理测试
1. **无效 JSON**: 尝试导入格式错误的 JSON 文件
   - 预期: 控制台输出 "Import validation failed"
2. **空文件**: 导入空 JSON 文件 `{}`
   - 预期: 验证通过但不导入任何数据
3. **中断操作**: 打开对话框后点击 Cancel
   - 预期: 无任何副作用

## 已知限制
- 导入操作会**追加**数据，不会删除现有数据
- 如果 ID 冲突，新数据会覆盖旧数据（取决于各 store 的 addModel/addBook 实现）
- 导入过程无进度提示（同步操作）

## 调试技巧
- 打开开发者工具 (Cmd+Option+I / Ctrl+Shift+I)
- 查看控制台日志:
  ```
  Export settings error: ...
  Import settings error: ...
  Import validation failed: ...
  ```
- 主进程日志在终端中查看 (运行 `bun run dev:electron` 的窗口)

## 代码位置
- 主进程: `src-electron/electron-main.ts`
- 渲染进程: `src/composables/useElectronSettings.ts`
- 集成点: `src/App.vue` (调用 useElectronSettings())
- 验证逻辑: `src/services/settings-service.ts`
