import { execFileSync } from 'node:child_process';

/**
 * 执行一条 git 命令，返回去掉首尾空白的 stdout；命令失败（没有 git / 不是仓库）时返回 null
 */
export type GitRunner = (args: string[]) => string | null;

export interface BuildInfo {
  /** 7 位短 SHA；拿不到时为 'dev' */
  commit: string;
  /** HEAD 的提交数，只有完整克隆时才可信；否则为 null */
  commitCount: number | null;
}

const SHORT_SHA_LENGTH = 7;
const SHA_PATTERN = /^[0-9a-f]{7,40}$/;

function normalizeSha(value: string | null | undefined): string | null {
  const sha = value?.trim().toLowerCase() ?? '';
  return SHA_PATTERN.test(sha) ? sha : null;
}

function resolveCommitCount(runGit: GitRunner): number | null {
  // 浅克隆的提交数不是 main 上的真实数量，宁可不显示也不显示错的
  if (runGit(['rev-parse', '--is-shallow-repository']) !== 'false') return null;
  const output = runGit(['rev-list', '--count', 'HEAD']) ?? '';
  if (!/^\d+$/.test(output)) return null;
  const count = Number(output);
  return count > 0 ? count : null;
}

/**
 * 解析构建信息：commit 依次取 BUILD_COMMIT 环境变量（DigitalOcean 绑定 ${组件.COMMIT_HASH}）
 * → 本地 git HEAD → 'dev'；提交数只在完整克隆、且与 commit 指向同一提交时给出
 */
export function resolveBuildInfo(
  env: Record<string, string | undefined>,
  runGit: GitRunner,
): BuildInfo {
  const envSha = normalizeSha(env.BUILD_COMMIT);
  const headSha = normalizeSha(runGit(['rev-parse', 'HEAD']));
  const sha = envSha ?? headSha;
  if (!sha) return { commit: 'dev', commitCount: null };

  // 环境变量指定的 commit 与本地 HEAD 不一致时，本地提交数对应的不是这次构建
  const sameCommit = headSha !== null && (headSha.startsWith(sha) || sha.startsWith(headSha));
  return {
    commit: sha.slice(0, SHORT_SHA_LENGTH),
    commitCount: sameCommit ? resolveCommitCount(runGit) : null,
  };
}

export function createGitRunner(cwd: string): GitRunner {
  return (args) => {
    try {
      return execFileSync('git', args, {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return null;
    }
  };
}
