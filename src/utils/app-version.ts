/**
 * 组合界面上显示的版本号：`x.y.z.提交数 (短 SHA)`，没有提交数时为 `x.y.z (短 SHA)`。
 * commit / commitCount 来自构建时注入的 APP_BUILD_COMMIT / APP_BUILD_COMMIT_COUNT。
 */
export function formatAppVersion(
  version: string,
  commit: string | undefined,
  commitCount: string | undefined,
): string {
  // 只取 x.y.z，兼容旧版 version.ts 里遗留的第 4 段 build 号
  const base = version.split('.').slice(0, 3).join('.');
  const count = /^\d+$/.test(commitCount ?? '') ? Number(commitCount) : 0;
  const prefix = count > 0 ? `${base}.${count}` : base;
  return `${prefix} (${commit || 'dev'})`;
}
