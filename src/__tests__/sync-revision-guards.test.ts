import { describe, expect, it } from 'bun:test';
import { isRevisionRestoreBlocked } from 'src/utils/sync-revision-guards';

describe('sync revision restore guards', () => {
  it('同步进行中应阻止恢复指定修订版本', () => {
    expect(
      isRevisionRestoreBlocked({
        gistId: 'test-gist',
        gistEnabled: true,
        isSyncing: true,
        isRestoringRevision: false,
        revertingVersion: null,
        version: 'abc1234',
      }),
    ).toBe(true);
  });

  it('恢复修订版本进行中应阻止再次恢复', () => {
    expect(
      isRevisionRestoreBlocked({
        gistId: 'test-gist',
        gistEnabled: true,
        isSyncing: false,
        isRestoringRevision: true,
        revertingVersion: null,
        version: 'abc1234',
      }),
    ).toBe(true);
  });

  it('缺少 gist 配置时应阻止恢复', () => {
    expect(
      isRevisionRestoreBlocked({
        gistId: '',
        gistEnabled: true,
        isSyncing: false,
        isRestoringRevision: false,
        revertingVersion: null,
        version: 'abc1234',
      }),
    ).toBe(true);
  });

  it('当前版本已经在恢复时应阻止重复恢复', () => {
    expect(
      isRevisionRestoreBlocked({
        gistId: 'test-gist',
        gistEnabled: true,
        isSyncing: false,
        isRestoringRevision: false,
        revertingVersion: 'abc1234',
        version: 'abc1234',
      }),
    ).toBe(true);
  });

  it('配置完整且未同步时应允许恢复', () => {
    expect(
      isRevisionRestoreBlocked({
        gistId: 'test-gist',
        gistEnabled: true,
        isSyncing: false,
        isRestoringRevision: false,
        revertingVersion: null,
        version: 'abc1234',
      }),
    ).toBe(false);
  });
});
