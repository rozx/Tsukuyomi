/**
 * 本地复刻 CI 的 Fallow 门禁，确保「本地通过 == CI 通过」。
 *
 * 背景：CI 用的 `fallow-rs/fallow@v2`（见 .github/workflows）开启了
 * `fail-on-issues + auto-changed-since + diff-filter:added`，它把**本次改动**里
 * 新引入的问题（含**重复 duplication clone groups**）计为 issue 并 fail。
 *
 * 而本地 `bunx fallow --fail-on-issues` 的 CLI 门禁**不把重复算进失败条件**，
 * 默认门禁又只看可维护性阈值 —— 所以本地会绿、CI 却红。本脚本按 CI 的口径
 * 自己解析 JSON：只要「相对 main 的改动范围内」有 dead-code 类 issue 或
 * 任意 duplication clone group，就以退出码 1 失败。
 *
 * 只对 diff 范围判定，因此**不会**对仓库里 pre-existing 的历史重复报错
 * （与「历史欠账留给单独 PR 修」的约定一致），只拦本次 PR 新引入的问题。
 *
 * 用法：`bun run quality-check:ci`（先跑过 `test:coverage` 才有 CRAP 数据，可选）。
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function sh(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 });
}

/** 解析出与 main 的 merge-base，优先 origin/main，回退本地 main。 */
function resolveBase(): string {
  for (const ref of ['origin/main', 'main']) {
    try {
      return sh('git', ['merge-base', ref, 'HEAD']).trim();
    } catch {
      // 尝试下一个 ref
    }
  }
  throw new Error('找不到 origin/main 或 main，无法确定 diff 基准');
}

const base = resolveBase();

// 生成「base → 工作区」的统一 diff（含未提交改动），供 fallow 做行级 scoping。
const diffPath = join(mkdtempSync(join(tmpdir(), 'fallow-ci-')), 'pr.diff');
writeFileSync(diffPath, sh('git', ['diff', base]));

// 与 CI 一致：--changed-since 负责文件发现，--diff-file 负责行级（added/changed）过滤。
const raw = sh('bunx', [
  'fallow',
  '--baseline',
  '.fallow-baseline.json',
  '--changed-since',
  base,
  '--diff-file',
  diffPath,
  '--format',
  'json',
]);

interface CloneInstance {
  file?: string;
  path?: string;
  start_line?: number;
  start?: number;
  end_line?: number;
  end?: number;
}
interface CloneGroup {
  instances?: CloneInstance[];
  clones?: CloneInstance[];
}
const data = JSON.parse(raw) as {
  check?: { total_issues?: number };
  dupes?: { clone_groups?: CloneGroup[] };
};

const checkIssues = data.check?.total_issues ?? 0;
const cloneGroups = data.dupes?.clone_groups ?? [];

console.log(`Fallow CI 门禁（diff 基准 ${base.slice(0, 8)}）：`);
console.log(`  dead-code 类 issue：${checkIssues}`);
console.log(`  重复 clone group：${cloneGroups.length}`);

if (checkIssues > 0 || cloneGroups.length > 0) {
  for (const g of cloneGroups) {
    const inst = g.instances ?? g.clones ?? [];
    const locs = inst
      .map(
        (i) =>
          `${i.file ?? i.path ?? '?'}:${i.start_line ?? i.start ?? '?'}-${i.end_line ?? i.end ?? '?'}`,
      )
      .join('  ||  ');
    console.log(`    - ${locs}`);
  }
  console.error('\n✗ 本次改动引入了 CI 会拦截的问题，请修复后再推送。');
  process.exit(1);
}

console.log('\n✓ 本次改动范围内无 CI 级别问题。');
