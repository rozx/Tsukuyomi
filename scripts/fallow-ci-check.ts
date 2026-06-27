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
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
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

// 覆盖率数据必须在跑 fallow 之前确认：CRAP 依赖 istanbul 覆盖文件，缺失时 health/CRAP 会被
// 静默漏判，造成「本地绿、CI 红」的假通过。直接失败，强制先跑 `bun run test:coverage`，
// 确保本门禁与 CI 的口径一致（CI 会在跑 fallow 前生成覆盖率）。
if (!existsSync('coverage/coverage-final.json')) {
  console.error(
    '✗ 未找到 coverage/coverage-final.json —— health/CRAP 无法可靠复刻 CI，请先跑 `bun run test:coverage` 再重试。',
  );
  process.exit(1);
}

// `git diff <base>` 与 `--changed-since` 默认都**看不到未跟踪新文件**，会漏检新文件里
// 引入的重复/问题（CI 检出的是已提交 PR，能看到新文件）。先对未跟踪文件做 intent-to-add
// （`git add -N`），让它们以「新增」形式进入 diff 与 changed-since 的文件发现；分析结束后
// 再撤销标记，工作区内容与已暂存内容均不受影响。
const untracked = sh('git', ['ls-files', '--others', '--exclude-standard'])
  .split('\n')
  .filter(Boolean);

const diffPath = join(mkdtempSync(join(tmpdir(), 'fallow-ci-')), 'pr.diff');
let raw: string;
if (untracked.length) sh('git', ['add', '-N', '--', ...untracked]);
try {
  writeFileSync(diffPath, sh('git', ['diff', base]));
  // 与 CI 一致：--changed-since 负责文件发现，--diff-file 负责行级（added/changed）过滤。
  raw = sh('bunx', [
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
} finally {
  if (untracked.length) sh('git', ['reset', '-q', '--', ...untracked]);
}

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
interface HealthFinding {
  path?: string;
  name?: string;
  line?: number;
  exceeded?: string;
  crap?: number;
  coverage_pct?: number;
}
const data = JSON.parse(raw) as {
  check?: { total_issues?: number };
  dupes?: { clone_groups?: CloneGroup[] };
  health?: { findings?: HealthFinding[] };
};

const checkIssues = data.check?.total_issues ?? 0;
const cloneGroups = data.dupes?.clone_groups ?? [];
// health.findings 即 CI 计入失败的复杂度/CRAP/覆盖问题；CRAP 依赖 istanbul 覆盖数据，
// 覆盖文件缺失会让这些问题「假阴性」，故缺失时显式告警。
const healthFindings = data.health?.findings ?? [];

console.log(`Fallow CI 门禁（diff 基准 ${base.slice(0, 8)}）：`);
console.log(`  dead-code 类 issue：${checkIssues}`);
console.log(`  重复 clone group：${cloneGroups.length}`);
console.log(`  健康度问题（复杂度 / CRAP / 覆盖）：${healthFindings.length}`);

if (checkIssues > 0 || cloneGroups.length > 0 || healthFindings.length > 0) {
  for (const g of cloneGroups) {
    const inst = g.instances ?? g.clones ?? [];
    const locs = inst
      .map(
        (i) =>
          `${i.file ?? i.path ?? '?'}:${i.start_line ?? i.start ?? '?'}-${i.end_line ?? i.end ?? '?'}`,
      )
      .join('  ||  ');
    console.log(`    - 重复: ${locs}`);
  }
  for (const f of healthFindings) {
    console.log(
      `    - 健康: ${f.path ?? '?'}:${f.line ?? '?'} ${f.name ?? '?'}（${f.exceeded ?? '?'}=${f.crap ?? '?'}, 覆盖率 ${f.coverage_pct ?? '?'}%）`,
    );
  }
  console.error('\n✗ 本次改动引入了 CI 会拦截的问题，请修复后再推送。');
  process.exit(1);
}

console.log('\n✓ 本次改动范围内无 CI 级别问题。');
