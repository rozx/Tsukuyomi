## Why

当本地是权威数据源而远端 Gist 漂移（例如远端被其他设备误写入、历史 revert 产生不一致、或远端残留已弃用条目），用户目前没有干净的方式让远端重新对齐本地：只能"删除 Gist 重建"（Gist ID 变更，其他设备失联）或"revert 到历史版本"（只能回到远端曾经的状态，不等于本地当前状态）。需要一条显式的单向路径：**以本地为准，强制覆盖远端**。

## What Changes

- 新增 UI toggle "强制推送本地数据到远程（覆盖远程）"，同时出现在两处入口：
  - 设置页 `SyncSettingsTab`
  - 顶栏同步面板 `SyncStatusBody`（桌面 Popover / 手机 BottomSheet）
- toggle 开启时，"同步"按钮动态变为 danger 样式的"强制推送到远程"
- 点击"强制推送到远程" SHALL 先弹出确认对话框；确认后执行单向上传，跳过下载与 pseudo-CAS
- 强制推送 SHALL 严格镜像：本地 manifest 未包含的远端条目（小说、memories、AI 模型、封面）SHALL 被删除
- 强制推送成功后 toggle 自动重置；失败后保持开启并显示 badge 提示
- 自动同步永远忽略 toggle，只走常规双向同步
- SyncConfig 新增持久化字段 `forceSyncMode: { active: boolean; lastFailedAt?: number }`

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `data-sync`: 新增 "强制推送（本地覆盖远端）" 相关需求——toggle 状态管理、确认对话框、单向上传流程、失败后持久化提示、自动同步豁免、两处 UI 入口

## Impact

- **代码**
  - `src/models/sync.ts` — `SyncConfig` 新增 `forceSyncMode` 字段
  - `src/stores/settings.ts` — 新增 getter/mutator 管理 `forceSyncMode`
  - `src/composables/useSyncExecutor.ts` — 新增 `executeForceSync()` 方法
  - `src/composables/useGistUploadWithConflictCheck.ts`（`useGistSync`）— 新增 `forceSync` 返回
  - `src/composables/useForceSync.ts` — 新增：封装确认对话框 + 触发 `forceSync`
  - `src/components/sync/ForceSyncToggle.vue` — 新增：共享 toggle + 警告文字 + 失败 badge 组件
  - `src/components/settings/SyncSettingsTab.vue` — 集成 toggle + 按钮动态切换
  - `src/components/sync/SyncStatusBody.vue` — 集成 toggle + 按钮动态切换
  - `src/components/sync/SyncStatusPanel.vue` — 暴露 `close()` 方法，供 force sync 确认前关闭父面板

- **测试**
  - 新增 `src/__tests__/sync-force-mode.test.ts`：strict mirror、toggle 状态管理、失败路径、pseudo-CAS 豁免、首次同步路径

- **持久化**
  - `SyncConfig` 新增字段通过现有 settingsStore 持久化路径写入 IndexedDB，沿用现有 schema 演进策略（旧数据无该字段时默认为 `undefined`，等同未开启）

- **无破坏性变更**
  - 普通双向同步路径零改动；自动同步行为不变；manifest 结构不变
