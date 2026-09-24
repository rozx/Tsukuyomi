## 1. 数据模型 & 持久化

- [x] 1.1 在 `src/models/sync.ts` 的 `SyncConfig` 接口中新增 `forceSyncMode?: { active: boolean; lastFailedAt?: number }` 字段，附注释说明旧数据缺失等同 `active: false`
- [x] 1.2 在 `src/stores/settings.ts` 中新增 getter `forceSyncMode`（返回默认 `{ active: false }`）与 mutator `updateForceSyncMode(partial)`，通过现有持久化路径写入 IndexedDB

## 2. 同步执行器 —— `executeForceSync`

- [x] 2.1 在 `src/composables/useSyncExecutor.ts` 中抽取共享 helper：`collectMemoriesByBook`、`buildLocalManifestFromStores`（从现有 `executeSync` 的阶段 3 抽出本地 manifest 构建逻辑，两条路径复用）
- [x] 2.2 新增 `executeForceSync(options: SyncExecutorOptions): Promise<SyncExecutorResult>`
- [x] 2.3 在 `executeForceSync` 成功路径中调用 `settingsStore.updateForceSyncMode({ active: false, lastFailedAt: undefined })`
- [x] 2.4 在 `executeForceSync` 失败路径（阶段 1 失败、阶段 3 上传失败）中调用 `settingsStore.updateForceSyncMode({ active: true, lastFailedAt: Date.now() })` 并返回 `success: false`
- [x] 2.5 在 `executeForceSync` 中检测 `config.syncParams.gistId` 为空时，委托给 `executeSync` 的首次上传逻辑，完成后强制 `forceSyncMode.active = false`，toast 提示"未检测到远程 Gist，已按普通同步处理"
- [x] 2.6 将 `useSyncExecutor` 的返回值扩展为 `{ executeSync, executeForceSync }`

## 3. Composable 封装

- [x] 3.1 在 `src/composables/useGistUploadWithConflictCheck.ts` 的 `useGistSync()` 中新增 `forceSync(config?: SyncConfig): Promise<void>`，内部复用 `executeForceSync`，保留 `isSyncing` 防重入，toast 行为参考现有 `sync()`
- [x] 3.2 新增 `src/composables/useForceSync.ts`，暴露 `confirmAndForceSync(options?: { onBeforeConfirm?: () => void; config?: SyncConfig }): Promise<void>`
- [x] 3.3 导出 `useGistSync()` 更新为 `{ sync, forceSync, restoreDeletedItems }`

## 4. UI 共享组件

- [x] 4.1 新增 `src/components/sync/ForceSyncToggle.vue`
- [x] 4.2 在 `src/components/sync/SyncStatusPanel.vue` 中通过 `defineExpose` 暴露 `close()`，并通过 provide/inject 让 SyncStatusBody 能触发父面板关闭
- [x] 4.3 在 SyncSettingsTab 和 SyncStatusBody 各自挂载 `<ConfirmDialog group="force-sync" />`

## 5. UI 集成 —— 两处入口

- [x] 5.1 在 `src/components/settings/SyncSettingsTab.vue` 的"操作按钮"区块顶部插入 `<ForceSyncToggle />`
- [x] 5.2 修改 `SyncSettingsTab.vue` 的"同步"按钮：基于 `forceSyncMode.active` 动态切换 label/severity/handler
- [x] 5.3 在 `src/components/sync/SyncStatusBody.vue` 的底部按钮区上方插入 `<ForceSyncToggle />`
- [x] 5.4 修改 `SyncStatusBody.vue` 的"同步"按钮：动态切换 + 强制模式 handler 通过 inject 关闭父 Popover
- [x] 5.5 两处 UI 通过 Pinia 响应性保持状态同步（`settingsStore.forceSyncMode` 驱动）

## 6. 测试

- [x] 6.1 新增 `src/__tests__/sync-force-mode.test.ts`，使用 `mock.module` 隔离 store 避免跨文件污染
- [x] 6.2 测试：strict mirror —— `uploadToGistIncremental` 收到的 `effectiveConfig.knownRemoteHashes`/`knownRemoteEntries` 都是空对象
- [x] 6.3 测试：成功推送后 `forceSyncMode.active` 变为 `false`、`lastFailedAt` 为 undefined
- [x] 6.4 测试：上传失败后 `forceSyncMode.active` 保持 `true`、`lastFailedAt` 被设置
- [x] 6.5 测试：pseudo-CAS 豁免 —— `verifyRemoteUnchanged` 未被调用
- [x] 6.6 测试：无 `gistId` 时退化为 `executeSync` 并重置 toggle
- [ ] 6.7 跳过 —— 自动同步不调用 forceSync（该分支在 useAutoSync 中，与本 change 无耦合；spec 已描述）
- [ ] 6.8 跳过 —— ForceSyncToggle 组件模板仅绑定计算属性，逻辑在 store getter 中已覆盖

## 7. 验证

- [x] 7.1 运行 `bun run lint && bun run type-check`，无错误
- [x] 7.2 `bun test sync-force-mode` / `bun test sync` / `bun test` 均通过（1125 pass / 0 fail）
- [ ] 7.3 手测流程（dev 模式，留给用户） —— 建议覆盖：
  - 设置页开 toggle → "同步"按钮变为 danger "强制推送到远程" → 点击弹确认框 → 确认后远端被本地覆盖 → toggle 自动关闭
  - 打开顶栏同步面板 → toggle 状态与设置页一致 → 在面板内切换 → 返回设置页状态已同步
  - 断网触发强制推送失败 → toggle 保持开启 + 红色 badge 显示失败提示
  - 自动同步触发时（toggle 开启）→ 走正常双向同步，toggle 状态不变
