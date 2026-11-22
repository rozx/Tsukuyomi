/**
 * 项目对外链接（GitHub 仓库 / Issue）
 */

/** GitHub 仓库地址（同时也是 Star 的落地页） */
export const PROJECT_REPO_URL = 'https://github.com/rozx/Tsukuyomi';

/** GitHub Issue 列表 */
export const PROJECT_ISSUES_URL = `${PROJECT_REPO_URL}/issues`;

export interface IssueReportEnvironment {
  /** 界面显示的版本号，如 `0.18.1.1532 (0fa51f9)` */
  version: string;
  /** 运行平台，如 `Web` / `Desktop (Electron)` */
  platform: string;
  /** 浏览器 UA，可选 */
  userAgent?: string | undefined;
  /** 正文开头的填写提示，以 HTML 注释写入，提交后不会显示 */
  hint?: string;
}

/**
 * 生成「新建 Issue」链接，正文预填版本号与运行环境，方便定位问题。
 * 用户在 GitHub 页面上仍可自由修改或删除预填内容。
 */
export function buildIssueReportUrl(env: IssueReportEnvironment): string {
  const lines: string[] = [];
  if (env.hint) {
    // 拆开注释结束符，避免提示文字提前闭合注释
    lines.push(`<!-- ${env.hint.replace(/-->/g, '-- >')} -->`, '');
  }
  lines.push('', '---', `- Version: ${env.version}`, `- Platform: ${env.platform}`);
  if (env.userAgent) lines.push(`- User agent: ${env.userAgent}`);

  return `${PROJECT_ISSUES_URL}/new?body=${encodeURIComponent(lines.join('\n'))}`;
}
