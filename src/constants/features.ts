/**
 * 功能开关。
 *
 * `importWorkspace` 是 AI 导入的回退开关：发布前向兼容的回退版本时改为 false，
 * 关闭导航入口、导入路由、Agent 执行与应用导入；数据库版本、导入 stores、任务记录
 * 与已导入小说全部保留，不降级数据库，也不删除任何数据。重新开启后可继续原任务。
 */
export const FEATURES = {
  importWorkspace: true,
};

/** 主导航项是否显示；关闭的功能不出现在任何设备的导航中。 */
export function isNavTabEnabled(tab: string): boolean {
  return tab !== 'import' || FEATURES.importWorkspace;
}

export function assertImportWorkspaceEnabled(): void {
  if (!FEATURES.importWorkspace)
    throw new Error('IMPORT_DISABLED: 当前版本已关闭 AI 导入，已有任务与小说均已保留');
}
