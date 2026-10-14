import './setup';
import { describe, expect, it } from 'vitest';
import { resolveBuildInfo, type GitRunner } from '../../vite-plugins/build-info';

const FULL_SHA = '0fa51f94c3d2b1a0e9f8d7c6b5a4f3e2d1c0b9a8';

/**
 * 构造假的 git 执行器：按参数串返回预设输出，未命中返回 null（模拟命令失败 / 没有 .git）
 */
function fakeGit(responses: Record<string, string>): GitRunner {
  return (args) => responses[args.join(' ')] ?? null;
}

const FULL_CLONE_GIT = fakeGit({
  'rev-parse HEAD': FULL_SHA,
  'rev-parse --is-shallow-repository': 'false',
  'rev-list --count HEAD': '1532',
});

describe('resolveBuildInfo', () => {
  describe('commit 来源优先级', () => {
    it('BUILD_COMMIT 环境变量优先，并截成 7 位小写短 SHA', () => {
      const info = resolveBuildInfo({ BUILD_COMMIT: FULL_SHA.toUpperCase() }, FULL_CLONE_GIT);
      expect(info.commit).toBe('0fa51f9');
    });

    it('BUILD_COMMIT 首尾空白会被忽略', () => {
      const info = resolveBuildInfo({ BUILD_COMMIT: `  ${FULL_SHA}\n` }, fakeGit({}));
      expect(info.commit).toBe('0fa51f9');
    });

    it('没有 BUILD_COMMIT 时回退到 git HEAD', () => {
      const info = resolveBuildInfo({}, FULL_CLONE_GIT);
      expect(info.commit).toBe('0fa51f9');
    });

    it('BUILD_COMMIT 为空字符串时回退到 git HEAD', () => {
      const info = resolveBuildInfo({ BUILD_COMMIT: '' }, FULL_CLONE_GIT);
      expect(info.commit).toBe('0fa51f9');
    });

    it('BUILD_COMMIT 是未解析的绑定模板（如 ${web.COMMIT_HASH}）时回退到 git', () => {
      const info = resolveBuildInfo({ BUILD_COMMIT: '${web.COMMIT_HASH}' }, FULL_CLONE_GIT);
      expect(info.commit).toBe('0fa51f9');
    });

    it('BUILD_COMMIT 不足 7 位时视为无效', () => {
      const info = resolveBuildInfo({ BUILD_COMMIT: 'abc12' }, fakeGit({}));
      expect(info.commit).toBe('dev');
    });

    it('git 输出不是合法 SHA 时视为无效', () => {
      const info = resolveBuildInfo({}, fakeGit({ 'rev-parse HEAD': 'fatal: not a git repo' }));
      expect(info.commit).toBe('dev');
    });

    it('环境变量和 git 都拿不到时为 dev', () => {
      const info = resolveBuildInfo({}, fakeGit({}));
      expect(info.commit).toBe('dev');
    });
  });

  describe('提交数（可选）', () => {
    it('完整克隆时返回 HEAD 的提交数', () => {
      expect(resolveBuildInfo({}, FULL_CLONE_GIT).commitCount).toBe(1532);
    });

    it('浅克隆时不返回提交数', () => {
      const git = fakeGit({
        'rev-parse HEAD': FULL_SHA,
        'rev-parse --is-shallow-repository': 'true',
        'rev-list --count HEAD': '1',
      });
      expect(resolveBuildInfo({}, git).commitCount).toBeNull();
    });

    it('无法判断是否浅克隆时不返回提交数', () => {
      const git = fakeGit({ 'rev-parse HEAD': FULL_SHA, 'rev-list --count HEAD': '1532' });
      expect(resolveBuildInfo({}, git).commitCount).toBeNull();
    });

    it('提交数输出不是正整数时不返回', () => {
      for (const output of ['0', '-3', '12a', '']) {
        const git = fakeGit({
          'rev-parse HEAD': FULL_SHA,
          'rev-parse --is-shallow-repository': 'false',
          'rev-list --count HEAD': output,
        });
        expect(resolveBuildInfo({}, git).commitCount).toBeNull();
      }
    });

    it('BUILD_COMMIT 与本地 git HEAD 不是同一个 commit 时不返回提交数', () => {
      const info = resolveBuildInfo({ BUILD_COMMIT: 'deadbeefcafe' }, FULL_CLONE_GIT);
      expect(info.commit).toBe('deadbee');
      expect(info.commitCount).toBeNull();
    });

    it('BUILD_COMMIT 与本地 git HEAD 一致时返回提交数', () => {
      const info = resolveBuildInfo({ BUILD_COMMIT: FULL_SHA }, FULL_CLONE_GIT);
      expect(info.commitCount).toBe(1532);
    });

    it('没有 git 时不返回提交数', () => {
      const info = resolveBuildInfo({ BUILD_COMMIT: FULL_SHA }, fakeGit({}));
      expect(info.commitCount).toBeNull();
    });
  });
});
